/**
 * @typedef EvalError
 * @property {'StackOverflow' | 'IllegalNodeType' | 'InvalidInput'} type
 * @property {string} message
 * @property {string[]} tagStack
 * @property {string[]} stateStack
 * @property {string} committedInput
 */

/**
 * @typedef EvalResult
 * @property {number} len match length
 * @property {LangTag[]} tags
 */

/**
 * @typedef LangTag
 * @property {string} name
 * @property {number} index
 * @property {number} len
 * @property {LangTag[]} subTags
 */
/**
 * @param {string} name
 * @param {number} index
 * @param {number} len
 * @param {LangTag[] | undefined} subTags
 * @returns {LangTag}
 */
function newLangTag(name, index, len, subTags) {
    return { name: name, index: index, len: len, subTags: (subTags === undefined ? [] : subTags ) };
}

/**
 * @param {string} message
 * @returns {EvalError}
 * @constructor
 */
function EvalError_StackOverflow(message) {
    return {type: 'StackOverflow', message: message, tagStack: [], stateStack: [], committedInput: ""};
}

/**
 * @param {string} nodeType
 * @returns {EvalError}
 * @constructor
 */
function EvalError_IllegalNodeType(nodeType) {
    let message = `Tried to evaluate unknown nodeType: ${nodeType}`;
    return {type: 'IllegalNodeType', message: message, tagStack: [], stateStack: [], committedInput: ""};
}

/**
 * @param {LangTreeNode} node
 * @param {string} committedInput
 * @returns {EvalError}
 * @constructor
 */
function EvalError_InvalidInput(node, committedInput) {
    let message = `None of the ${node.transitions.length} possible transitions of the '${node.nodeContentText()}' ${node.node.nodeType()}-Node accepted the input.`
    return {type: 'InvalidInput', message: message, tagStack: [], stateStack: [], committedInput: committedInput};
}

/**
 * @property {Object.<string, LangTreeNode>} treeNodes
 * @property {string} rootNode
 */
const LangEvaluator = class LangEvaluator {
    static _maxNoProgressTicks = 1000;

    /**
     * @param {LangTreeNode[]} treeNodes
     * @param {string} rootNode
     */
    constructor(treeNodes, rootNode) {
        let stateNodeMap = {};
        for (let tNode of treeNodes) {
            // noinspection JSValidateTypes
            /** @type {LangNode_State} */
            let sNode = tNode.node;
            stateNodeMap[sNode.stateName] = tNode;
        }

        this.treeNodes = stateNodeMap;
        this.rootNode = rootNode;
    }

    /**
     * @param {string} input
     * @returns {{result: EvalResult, unmatchedStr: string | undefined, evalError: EvalError | undefined}}
     */
    evaluateAll(input) {
        /**
         * @type {{result: EvalResult, unmatchedStr: string | undefined, evalError: EvalError | undefined}}
         */
        let result = {
            result: {len: 0, tags: []},
            unmatchedStr: undefined,
            evalError: undefined,
        };

        let remainStr = input;
        let posOffset = 0;
        while (remainStr.length > 0) {
            /** @type {undefined | EvalResult} */
            let subResult = undefined;
            try {
                subResult = this.evaluate(remainStr);
            } catch (e) {
                if (e.hasOwnProperty("type")) {
                    result.evalError = e;
                } else {
                    throw e;
                }
            }
            if (subResult === undefined) {
                break;
            }

            result.result.len += subResult.len;
            subResult.tags.map(tag => TreeHelper.iteratePreorder(tag, x => x.subTags, x => x.index += posOffset));
            result.result.tags.push(...subResult.tags);

            remainStr = remainStr.substring(subResult.len);
            posOffset += subResult.len;
        }

        if (remainStr.length > 0) {
            result.unmatchedStr = remainStr;
        }
        return result;
    }

    /**
     * @param {string} input
     * @throws EvalError
     * @returns {EvalResult | undefined} undefined if the node rejected the input
     */
    evaluate(input) {
        this.noProgressTicks = 0;
        return this._nodeMatches(input, 0, this.treeNodes[this.rootNode]);
    }

    /**
     * @param {string} input
     * @param {number} pos current position in the input
     * @param {LangTreeNode} node
     * @throws EvalError
     * @returns {EvalResult | undefined} undefined if no match
     * @private
     */
    _nodeMatches(input, pos, node) {
        //console.log(`check node type '${node.node.nodeType()}'. data: '${node.node.contentText()}'. len_remain: ${input.length}`);

        this.noProgressTicks++;
        if (this.noProgressTicks > LangEvaluator._maxNoProgressTicks) {
            throw EvalError_StackOverflow(`Exceeded the maximum amount of ticks without progressing. (${LangEvaluator._maxNoProgressTicks})`);
        }
        if (node.node.nodeType() === NodeTypes.applyTag) {
            // noinspection JSValidateTypes
            /** @type {LangNode_ApplyTag} */
            let lNode = node.node;
            let tRes = this._transitionsMatch(input, pos, node);
            if (tRes === undefined && node.commit) {
                let err = EvalError_InvalidInput(node, input.substring(0, pos));
                err.tagStack.splice(0, 0, lNode.tagName);
                throw err;
            }
            if (tRes !== undefined) {
                tRes.tags = [newLangTag(lNode.tagName, pos, tRes.len, tRes.tags)];
            }
            return tRes;
        } else if (node.node.nodeType() === NodeTypes.subState) {
            // noinspection JSValidateTypes
            /** @type {LangNode_SubState} */
            let lNode = node.node;
            let stateNode = this.treeNodes[lNode.stateName];

            let minMatches = lNode.repetition.minRepeat;
            let maxMatches = lNode.repetition.maxRepeat;
            let numMatches = 0;
            let matchLength = 0;
            /** @type {LangTag[]} */
            let matchTags = [];
            while (true) {
                if (
                    (numMatches >= minMatches && !lNode.repetition.greedy)
                    || (maxMatches !== undefined && numMatches >= maxMatches)
                ) {
                    let tRes = this._transitionsMatch(input, pos + matchLength, node);
                    if (tRes !== undefined) {
                        tRes.len += matchLength;
                        tRes.tags.splice(0, 0, ...matchTags);
                        return tRes;
                    }
                    // ignore case when transitions do not accept, first try matching the subState again.
                }

                if (maxMatches !== undefined && numMatches >= maxMatches) {
                    if (numMatches >= minMatches && node.commit) {
                        throw EvalError_InvalidInput(node, input.substring(0, pos + matchLength));
                    }

                    //console.log(`subState ${node.node.contentText()} rejects, ${numMatches} > ${maxMatches}`);
                    return undefined;
                }

                // either not enough matches, or is greedy, or none of the transitions matched.
                let stateRes = this._nodeMatches(input, pos + matchLength, stateNode);
                //console.log(`subState ${node.node.contentText()} matched with len ${len}`);
                if (stateRes === undefined) {
                    if (numMatches < minMatches) {
                        if (numMatches > 0 && node.commit) {
                            throw EvalError_InvalidInput(node, input.substring(0, pos + matchLength));
                        }

                        //console.log(`subState ${node.node.contentText()} rejects, ${numMatches} < ${minMatches}`);
                        return undefined;
                    }
                    // found enough matches to move on
                    // either:  is greedy -> check transitions
                    // or:     not greedy, transitions have rejected
                    if (!lNode.repetition.greedy) {
                        if (node.commit) {
                            throw EvalError_InvalidInput(node, input.substring(0, pos + matchLength));
                        }

                        //console.log(`subState ${node.node.contentText()} rejects, non-greedy, no match`);
                        return undefined;
                    }

                    let tRes = this._transitionsMatch(input, pos + matchLength, node);
                    if (tRes === undefined) {
                        if (node.commit) {
                            throw EvalError_InvalidInput(node, input.substring(0, pos + matchLength));
                        }
                        return undefined;
                    }

                    tRes.len += matchLength;
                    tRes.tags.splice(0, 0, ...matchTags);
                    return tRes;
                }

                if (stateRes.len > 0) {
                    this.noProgressTicks = 0;
                } else {
                    this.noProgressTicks++;
                    if (this.noProgressTicks > LangEvaluator._maxNoProgressTicks) {
                        throw EvalError_StackOverflow(`Exceeded the maximum amount of ticks without progressing. (${LangEvaluator._maxNoProgressTicks})`);
                    }
                }
                numMatches++;
                matchLength += stateRes.len;
                matchTags.push(...stateRes.tags);
            }
        } else if (node.node.nodeType() === NodeTypes.state) {
            return this._transitionsMatch(input, pos, node);
        } else if (node.node.nodeType() === NodeTypes.matchUnicode) {
            if (input.length < (pos + 1)) {
                return undefined;
            }

            // noinspection JSValidateTypes
            /** @type {LangNode_MatchUnicode} */
            let lNode = node.node;
            let c = input.charCodeAt(pos);
            if (lNode.charCodeConstraint.minCodeInclusive !== undefined && c < lNode.charCodeConstraint.minCodeInclusive) {
                return undefined;
            }
            if (lNode.charCodeConstraint.maxCodeInclusive !== undefined && c > lNode.charCodeConstraint.maxCodeInclusive) {
                return undefined;
            }
            let tRes = this._transitionsMatch(input, pos + 1, node);
            if (tRes === undefined) {
                if (node.commit) {
                    throw EvalError_InvalidInput(node, input.substring(0, pos + 1));
                }
                return undefined;
            }
            this.noProgressTicks = 0;
            tRes.len += 1;
            return tRes;
        } else if (node.node.nodeType() === NodeTypes.matchLiteral) {
            // noinspection JSValidateTypes
            /** @type {LangNode_MatchLiteral} */
            let lNode = node.node;
            let len = lNode.literalText.length;
            if (input.length < (pos + len)) {
                return undefined;
            }
            if (input.substring(pos, pos + len) !== lNode.literalText) {
                return undefined;
            }
            let tRes = this._transitionsMatch(input, pos + len, node);
            if (tRes === undefined) {
                if (node.commit) {
                    throw EvalError_InvalidInput(node, input.substring(0, pos + len));
                }
                return undefined;
            }
            this.noProgressTicks = 0;
            tRes.len += len;
            return tRes;
        } else if (node.node.nodeType() === NodeTypes.matchRegex) {
            // noinspection JSValidateTypes
            /** @type {LangNode_MatchRegex} */
            let lNode = node.node;
            let regExp = new RegExp(`^${lNode.regex}`, "s");
            let matches = input.substring(pos).match(regExp);
            if (matches === null || matches.length <= 0) {
                return undefined;
            }
            let len = matches[0].length;
            let tRes = this._transitionsMatch(input, pos + len, node);
            if (tRes === undefined) {
                if (node.commit) {
                    throw EvalError_InvalidInput(node, input.substring(0, pos + len));
                }
                return undefined;
            }
            this.noProgressTicks = 0;
            tRes.len += len;
            return tRes;
        } else {
            throw EvalError_IllegalNodeType(node.node.nodeType());
        }
    }

    /**
     *
     * @param {string} input
     * @param {number} pos current position in the input
     * @param {LangTreeNode} node the node whose transitions to check
     * @returns {EvalResult | undefined} undefined if no match
     * @private
     */
    _transitionsMatch(input, pos, node) {
        if (node.transitions.length <= 0) {
            return {len: 0, tags: []};
        }

        try {
            for (let nextNode of node.transitions) {
                let res = this._nodeMatches(input, pos, nextNode);
                if (res !== undefined) {
                    return res;
                }
            }
        } catch (e) {
            if (e.hasOwnProperty("type")) {
                /** @type {EvalError} */
                let err = e;

                if (node.node.nodeType() === NodeTypes.applyTag) {
                    // noinspection JSValidateTypes
                    /** @type {LangNode_ApplyTag} */
                    let lNode = node.node;
                    err.tagStack.splice(0, 0, lNode.tagName);
                } else if (node.node.nodeType() === NodeTypes.subState) {
                    // node contains no information to be added
                } else if (node.node.nodeType() === NodeTypes.state) {
                    // noinspection JSValidateTypes
                    /** @type {LangNode_State} */
                    let lNode = node.node;
                    err.stateStack.splice(0, 0, lNode.stateName);
                } else if (node.node.nodeType() === NodeTypes.matchUnicode) {
                    // node contains no information to be added
                } else if (node.node.nodeType() === NodeTypes.matchLiteral) {
                    // node contains no information to be added
                } else if (node.node.nodeType() === NodeTypes.matchRegex) {
                    // node contains no information to be added
                } else {
                    throw EvalError_IllegalNodeType(node.node.nodeType());
                }
            }
            throw e;
        }

        return undefined;
    }
}
