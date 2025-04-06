/**
 * This Helper Class converts arbitrary GraphLexer languages to Antlr4 combined grammars.
 * <p> It works, but <b>really</b> shouldn't be used.
 * <p> Antlr4 has no concept of backtracking, so the generated grammars cause a lookahead nightmare and the performance is atrocious.
 * <p> E.g. even for (relatively) small inputs of ~200 characters, the generated Regex.g4 takes several seconds to parse it.
 */
class AntlrExport {
    /**
     * @param {LangTreeNode[]} states
     * @param {string} rootState
     */
    static toAntlr4(states, rootState) {
        let parserRuleNames = new Set();
        let parserRules = [""];
        let lexerRules = new AntlrExport.LexerRuleHandler();
        let foundRoot = false;
        for (let state of states) {
            let stateExpr = AntlrExport._toAntlr4(state, parserRuleNames, parserRules, lexerRules);
            /** @type {LangNode_State} */
            let lNode = state.node;
            if (lNode.stateName === rootState) {
                parserRules[0] = `root : (${stateExpr})+ EOF ;`;
                foundRoot = true;
            }
        }
        if (!foundRoot) {
            throw new Error(`rootState '${rootState}' is not defined in states: ${JSON.stringify(states)}`);
        }
        parserRules.push("failure : .*? EOF ;");
        return parserRules.join("\n") + "\n\n" + lexerRules.generateRules().join("\n") + "\n\nAny : . ;";
    }

    /**
     * @param {number} num
     * @param {number} targetLen
     */
    static toAntlrUnicodeHex(num, targetLen) {
        let numStr = num.toString(16).toUpperCase();
        if (numStr.length < targetLen) {
            numStr = "0".repeat(targetLen - numStr.length) + numStr;
        } else if (numStr.length > targetLen) {
            numStr = numStr.slice(numStr.length - targetLen);
        }
        return numStr;
    }

    /**
     * @param {string} ruleName
     * @return {string}
     * @private
     */
    static _escapeRuleName(ruleName) {
        return ruleName.replaceAll(/[^a-zA-Z0-9_]/g, "_");
    }

    /**
     * @param {LangTreeNode} node
     * @param {Set<string>} parserRuleNames
     * @param {string[]} parserRules
     * @param {AntlrExport.LexerRuleHandler} lexerRules
     * @return {string} an expression that "invokes" the encoded node
     */
    static getAntlrSubNodeStr(node, parserRuleNames, parserRules, lexerRules) {
        if (node.transitions.length === 0) {
            return "";
        }

        let subNodeStr = node.transitions.map(subNode => AntlrExport._toAntlr4(subNode, parserRuleNames, parserRules, lexerRules)).join(" | ");
        if (node.commit) { // the current node has already matched -> if the tail cannot be matched, fail
            subNodeStr = "((" + subNodeStr + ") | failure)";
        } else if (node.transitions.length > 1) {
            subNodeStr = "(" + subNodeStr + ")";
        }
        return " " + subNodeStr;
    }

    /**
     * @param {LangTreeNode} node
     * @param {Set<string>} parserRuleNames
     * @param {string[]} parserRules
     * @param {AntlrExport.LexerRuleHandler} lexerRules
     * @return {string} an expression that "invokes" the encoded node
     * @private
     */
    static _toAntlr4(node, parserRuleNames, parserRules, lexerRules) {
        switch (node.node.nodeType()) {
            case NodeTypes.state : {
                // noinspection JSValidateTypes
                /** @type {LangNode_State} */
                let lNode = node.node;
                let ruleName = AntlrExport._escapeRuleName(`state${lNode.stateName}`);
                let suffix = 1;
                let suffixRuleName = ruleName;
                while (parserRuleNames.has(suffixRuleName)) {
                    suffixRuleName = ruleName + "_" + suffix;
                    suffix++;
                }
                ruleName = suffixRuleName;
                parserRuleNames.add(ruleName);

                let parserRuleIdx = parserRules.length;
                parserRules.push(""); // claim this slot to keep the order despite recursion
                parserRules[parserRuleIdx] =
                    `${ruleName} :${AntlrExport.getAntlrSubNodeStr(node, parserRuleNames, parserRules, lexerRules)} ;`;

                return ruleName;
            }
            case NodeTypes.matchLiteral : {
                // noinspection JSValidateTypes
                /** @type {LangNode_MatchLiteral} */
                let lNode = node.node;
                if (lNode.literalText.length === 0) {
                    // 0-length literals are a bit of a hack, but they're convenient, so I'm keeping them.
                    return AntlrExport.getAntlrSubNodeStr(node, parserRuleNames, parserRules, lexerRules);
                } else {
                    return `${AntlrExport._literalToTokens(lNode.literalText, lexerRules)}${AntlrExport.getAntlrSubNodeStr(node, parserRuleNames, parserRules, lexerRules)}`;
                }
            }
            case NodeTypes.matchUnicode : {
                // noinspection JSValidateTypes
                /** @type {LangNode_MatchUnicode} */
                let lNode = node.node;
                let constraint = lNode.charCodeConstraint;
                let ruleName = lexerRules.forChars([[constraint.minCodeInclusive, constraint.maxCodeInclusive]], false);
                return `${ruleName}${AntlrExport.getAntlrSubNodeStr(node, parserRuleNames, parserRules, lexerRules)}`;
            }
            case NodeTypes.matchRegex : {
                // noinspection JSValidateTypes
                /** @type {LangNode_MatchRegex} */
                let lNode = node.node;
                let evalAll = RegexGL1.evaluator.evaluateAll(lNode.regex);
                let expression = evalAll.result;
                if (evalAll.unmatchedStr !== undefined) {
                    throw new Error("invalid regex in node: " + JSON.stringify(lNode) + ` | evalResult: ${JSON.stringify(evalAll)}`);
                }

                // there is no "nice" equivalent for these in Antlr (to my knowledge), I assume `{}?`-predicates can model these.
                let unsupportedTags = [
                    "InputBegin", "WordBoundary", "NonWordBoundary",
                    "Lookahead", "NegativeLookahead", "Lookbehind", "NegativeLookbehind",
                    "BackRef", "BackRefNamed", // might be possible with parser rule arguments? Seems hacky.
                    "ControlChar", // unsupported escape char (technically includes some of the 'escapeChar'-tags like `\v` as well...)
                ]
                let flatTags = AntlrExport._flattenTags(expression.tags);
                let unsupportedTagElements = flatTags.filter(tag => unsupportedTags.includes(tag.name));
                if (unsupportedTagElements.length > 0) {
                    throw new Error("The MatchRegex Node: " + JSON.stringify(lNode) + " contains Regular Expressions that are not supported for translation"
                        + " to Antlr. These unsupported tags were found: " + JSON.stringify(unsupportedTagElements));
                }

                // flag 'm' affects only boundaries which are not supported anyway.
                let unsupportedFlags = flatTags.filter(tag => tag.name === 'Flags').filter(tag => {
                    let flagsStr = lNode.regex.substring(tag.index, tag.index + tag.len);
                    return /[^is-]/.test(flagsStr);
                });
                if (unsupportedFlags.length > 0) {
                    throw new Error("The MatchRegex Node: " + JSON.stringify(lNode) + " contains groups with flags that are not supported for translation to"
                        + " Antlr. These Flags were found: " + JSON.stringify(unsupportedFlags));
                }

                let regexRule = AntlrExport._regexTagsToAntlr(lNode.regex, lexerRules, expression.tags, true, true);

                return `${regexRule}${AntlrExport.getAntlrSubNodeStr(node, parserRuleNames, parserRules, lexerRules)}`;
            }
            case NodeTypes.subState : {
                // noinspection JSValidateTypes
                /** @type {LangNode_SubState} */
                let lNode = node.node;
                let ruleName = AntlrExport._escapeRuleName(`state${lNode.stateName}`);
                if (!lNode.repetition.greedy && node.commit && node.transitions.length > 0 && lNode.repetition.maxRepeat !== lNode.repetition.minRepeat) {
                    // non-greedy committing substate needs special failure handling
                    //   if 'this*? (next | failure)' is generated, the non-greedy repetition causes '(next | failure)' to be checked first,
                    //   which always accepts -> repetition is never used

                    let subNodeStr = node.transitions.map(subNode => AntlrExport._toAntlr4(subNode, parserRuleNames, parserRules, lexerRules)).join(" | ");

                    let result = new Array(lNode.repetition.minRepeat).fill(ruleName);
                    if (lNode.repetition.maxRepeat === undefined) {
                        let recurRule = "anonRecur" + parserRuleNames.size;
                        parserRuleNames.add(recurRule);
                        parserRules.push(`${recurRule} : (${subNodeStr}) | ${ruleName} ${recurRule} | failure ;`);
                        result.push(`((${subNodeStr}) | ${ruleName} ${recurRule} | failure)`)
                    } else {
                        let optRepeat = lNode.repetition.maxRepeat - lNode.repetition.minRepeat;
                        let pushRepetition = (repsLeft) => {
                            if (repsLeft <= 0) {
                                result.push(`(${subNodeStr})`);
                            } else {
                                result.push(`((${subNodeStr}) | ${ruleName}`);
                                pushRepetition(repsLeft - 1);
                                result.push("| failure)");
                            }
                        };
                        pushRepetition(optRepeat);
                    }
                    return result.join(" ");
                } else {
                    let subStateExpr = AntlrExport._quantifyForAntlr(ruleName, lNode.repetition.greedy, lNode.repetition.minRepeat, lNode.repetition.maxRepeat).join(" ");
                    return `${subStateExpr}${AntlrExport.getAntlrSubNodeStr(node, parserRuleNames, parserRules, lexerRules)}`;
                }
            }
            case NodeTypes.applyTag : {
                // noinspection JSValidateTypes
                /** @type {LangNode_ApplyTag} */
                let lNode = node.node;
                let ruleName = AntlrExport._escapeRuleName(`tag${lNode.tagName}`);
                let suffix = 1;
                let suffixRuleName = ruleName;
                while (parserRuleNames.has(suffixRuleName)) {
                    suffixRuleName = ruleName + "_" + suffix;
                    suffix++;
                }
                ruleName = suffixRuleName;
                parserRuleNames.add(ruleName);

                let parserRuleIdx = parserRules.length;
                parserRules.push(""); // claim this slot to keep the order despite recursion
                parserRules[parserRuleIdx] =
                    `${ruleName} :${AntlrExport.getAntlrSubNodeStr(node, parserRuleNames, parserRules, lexerRules)} ;`;

                return ruleName;
            }
        }
    }

    /**
     * @param {string} literal
     * @param {AntlrExport.LexerRuleHandler} lexerRules
     * @return {string} token-sequence
     * @private
     */
    static _literalToTokens(literal, lexerRules) {
        return Array.from(literal).map(c => lexerRules.forChars([[c]], false)).join(" ");
    }

    /**
     * @param {string} regexStr
     * @param {AntlrExport.LexerRuleHandler} lexerRules
     * @param {LangTag[]} tags
     * @param {boolean} dotMatchesNewline
     * @param {boolean} caseSensitive
     * @return string
     * @private
     */
    static _regexTagsToAntlr(regexStr, lexerRules, tags, dotMatchesNewline, caseSensitive) {
        // split alternatives
        // pass group flags to subTags (recurse) -> wrap in parentheses
        // map CharacterClasses to [] and ~[] (requires a lexer rule)
        // map 'InputEnd' to EOF
        // map 'Wildcard' to .
        // map \xXX to \u00XX
        // map \u{X{4,5}} to \u{X{6}}
        // apply quantifiers

        let alternatives = AntlrExport._groupRegexAlternatives(tags);
        let alternativeStr = alternatives.map(altGroup => {
            /** @type {string[]} */
            let altEntries = [];
            for (let tag of altGroup) {
                if (tag.name === "CaptureGroup") {
                    altEntries.push(AntlrExport._regexTagsToAntlr(regexStr, lexerRules, tag.subTags, dotMatchesNewline, caseSensitive));
                } else if (tag.name === "TypeFlagged") {
                    // we must currently be in a captureGroup, update flags...
                    let addFlags = "";
                    let removeFlags = "";
                    if (tag.subTags.length === 1) {
                        addFlags = tag.subTags[0];
                    } else if (tag.subTags.length === 2) {
                        addFlags = tag.subTags[0];
                        removeFlags = tag.subTags[1];
                    } else {
                        throw new Error("unexpected amount of subTags for tag 'typeFlagged'. Tag: " + JSON.stringify(tag));
                    }

                    if (addFlags.includes("i")) {
                        caseSensitive = false;
                    }
                    if (addFlags.includes("s")) {
                        dotMatchesNewline = true;
                    }
                    if (removeFlags.includes("i")) {
                        caseSensitive = true;
                    }
                    if (removeFlags.includes("s")) {
                        dotMatchesNewline = false;
                    }
                } else if (tag.name === "CharacterClass" || tag.name === "NegatedCharacterClass") {
                    let negate = tag.name === "NegatedCharacterClass";
                    let charCodeList = tag.subTags.flatMap(ccTag => {
                        if (ccTag.name === "CharRange") {
                            return [ccTag.subTags.map(rangeTag => {
                                let tagValue = regexStr.slice(rangeTag.index, rangeTag.index + rangeTag.len);
                                if (rangeTag.name === "Hex") {
                                    return parseInt(tagValue.slice(2), 16);
                                } else if (rangeTag.name === "Utf16") {
                                    return parseInt(tagValue.slice(2), 16);
                                } else if (rangeTag.name === "Unicode") {
                                    return parseInt(tagValue.slice(3, tagValue.length - 1), 16);
                                } else if (rangeTag.name === "EscapeChar") {
                                    let escapedChar = tagValue.slice(1, 2);
                                    if ("dDwWsS".includes(escapedChar)) {
                                        throw new Error("char is not supported for range expression: " + JSON.stringify(rangeTag));
                                    }
                                    return AntlrExport._escapeCharToCode(escapedChar);
                                } else if (rangeTag.name === "Literal") {
                                    return tagValue.charCodeAt(0);
                                } else {
                                    throw new Error("char is not supported for range expression: " + JSON.stringify(rangeTag));
                                }
                            })];
                        } else {
                            let ccValue = regexStr.slice(ccTag.index, ccTag.index + ccTag.len);
                            if (ccTag.name === "Hex") {
                                return [[parseInt(ccValue.slice(2), 16)]];
                            } else if (ccTag.name === "Utf16") {
                                return [[parseInt(ccValue.slice(2), 16)]];
                            } else if (ccTag.name === "Unicode") {
                                return [[parseInt(ccValue.slice(3, ccValue.length - 1), 16)]];
                            } else if (ccTag.name === "EscapeChar") {
                                let escapedChar = ccValue.slice(1, 2);
                                if ("dDwWsS".includes(escapedChar)) {
                                    if (escapedChar === "d") {
                                        return [["0", "9"]];
                                    } else if (escapedChar === "D") {
                                        return [[0, 47], [58, 0x10ffff]];
                                    } else if (escapedChar === "w") {
                                        return [["A", "Z"], ["a", "z"], ["0", "9"], ["_"]];
                                    } else if (escapedChar === "W") {
                                        return [[0, 47], [58, 64], [91, 94], [96], [123, 0x10ffff]];
                                    } else if (escapedChar === "s") {
                                        return [["\f\n\r\t\u0020\u00A0\u1680\u2028\u2029\u202F\u205F\u3000\uFEFF"], ["\u2000", "\u200A"]];
                                    } else if (escapedChar === "S") {
                                        return [
                                            [0, 8], [11], [14, 0x20 - 1], [0x20 + 1, 0xA0 - 1], [0xA0 + 1, 0x1680 - 1],
                                            [0x1680 + 1, 0x2000 - 1], [0x200A + 1, 0x2028 - 1], [0x2029 + 1, 0x202f - 1], [0x202f + 1, 0x205f - 1],
                                            [0x205f + 1, 0x3000 - 1], [0x3000 + 1, 0xFEFF - 1], [0xFEFF + 1, 0x10FFFF]
                                        ];
                                    }
                                } else {
                                    return [[AntlrExport._escapeCharToCode(escapedChar)]];
                                }
                            } else if (ccTag.name === "Literal") {
                                return [[AntlrExport._escapeCharToCode(ccValue)]];
                            } else {
                                throw new Error("tag in characterClass was not a simpleChar: " + JSON.stringify(tag));
                            }
                        }
                    });
                    altEntries.push(lexerRules.forChars(charCodeList, negate));
                } else if (tag.name === "InputEnd") {
                    altEntries.push("EOF");
                } else if (tag.name === "Wildcard") {
                    if (dotMatchesNewline) {
                        altEntries.push(".");
                    } else {
                        altEntries.push(lexerRules.forChars([["\r"], ["\n"]], true));
                    }
                } else if (tag.name === "Quantifier") {
                    let greedy = undefined;
                    if (tag.subTags.length === 1) {
                        greedy = true;
                    } else if (tag.subTags.length === 2) {
                        console.assert(tag.subTags[1].name === "NonGreedy");
                        greedy = false;
                    } else {
                        throw new Error("unexpected amount of subTags for 'Quantifier' Tag: " + JSON.stringify(tag));
                    }

                    let typeTag = tag.subTags[0];
                    if (typeTag.name === "Type") {
                        // EBNF Operator (?*+)
                        altEntries.push(regexStr.slice(typeTag.index, typeTag.index + typeTag.len) + (greedy ? '' : '?'));
                    } else if (["Type{n}", "Type{n,}", "Type{n,m}"].includes(typeTag.name)) {
                        // Antlr does not do {n,m}, repeat previous token as needed.
                        if (altEntries.length === 0) {
                            throw new Error("Found quantifier but no preceding Elements. Quantifier: " + JSON.stringify(tag));
                        }
                        let repeatEntry = altEntries.pop();

                        // Be careful of edge cases: no upper bound, non/greedy
                        let range = typeTag.subTags.map(iTag => parseInt(regexStr.slice(iTag.index, iTag.index + iTag.len)));
                        let maxRepeat = typeTag.name === "Type{n}" ? range[0] : (range.length > 0 ? range[1] : undefined);
                        let reps = AntlrExport._quantifyForAntlr(repeatEntry, greedy, range[0], maxRepeat);
                        altEntries.push(...reps);
                    } else {
                        throw new Error("received unknown Quantifier type: " + typeTag.name);
                    }
                } else {
                    altEntries.push(`${AntlrExport._regexSimpleCharToAntlr(regexStr, lexerRules, tag, caseSensitive)}`);
                }
            }
            return altEntries.join(" ");
        }).join(" | ");
        return `( ${alternativeStr} )`;
    }

    /**
     * @param {string} escapedChar
     * @return {number} charCode
     * @private
     */
    static _escapeCharToCode(escapedChar) {
        if (escapedChar === "b") {
            return 8;
        } else if (escapedChar === "t") {
            return 9;
        } else if (escapedChar === "n") {
            return 10;
        } else if (escapedChar === "f") {
            return 12;
        } else if (escapedChar === "r") {
            return 13;
        }
        return escapedChar.charCodeAt(0);
    }

    /**
     * @param {string} srcStr
     * @param {AntlrExport.LexerRuleHandler} lexerRules
     * @param {LangTag} tag
     * @param {boolean} caseSensitive
     * @private
     */
    static _regexSimpleCharToAntlr(srcStr, lexerRules, tag, caseSensitive) {
        // Testing with https://regex101.com/ shows that: `(?i:\x42)` matches `b` and `B`
        // I'm choosing to pretend I did not see that...

        let tagValue = srcStr.slice(tag.index, tag.index + tag.len);
        if (tag.name === "Hex") {
            return lexerRules.forChars([[Number.parseInt(tagValue.slice(2), 16)]], false);
        } else if (tag.name === "Utf16") {
            return lexerRules.forChars([[Number.parseInt(tagValue.slice(2), 16)]], false);
        } else if (tag.name === "Unicode") {
            return lexerRules.forChars([[Number.parseInt(tagValue.slice(3, tagValue.length - 1), 16)]], false);
        } else if (tag.name === "UnicodeProperty") {
            return "'" + tagValue + "'"; // should be ok 1:1
        } else if (tag.name === "EscapeChar") {
            let escapedChar = tagValue.slice(1, 2);
            if ("btnfr'\\".includes(escapedChar)) {
                return lexerRules.forChars([[eval(`"\\${escapedChar}"`)]], false);
            } else if ("dDwWsS".includes(escapedChar)) {
                // request a parser-rule for these charsets, corresponding parser and lexer rules will be generated in a second pass
                if (escapedChar === "d") {
                    return lexerRules.forChars([["0", "9"]], false);
                } else if (escapedChar === "D") {
                    return lexerRules.forChars([["0", "9"]], true);
                } else if (escapedChar === "w") {
                    return lexerRules.forChars([["A", "Z"], ["a", "z"], ["0", "9"], ["_"]], false);
                } else if (escapedChar === "W") {
                    return lexerRules.forChars([["A", "Z"], ["a", "z"], ["0", "9"], ["_"]], true);
                } else if (escapedChar === "s") {
                    return lexerRules.forChars([["\f\n\r\t\u0020\u00A0\u1680\u2028\u2029\u202F\u205F\u3000\uFEFF"], ["\u2000", "\u200A"]], false);
                } else if (escapedChar === "S") {
                    return lexerRules.forChars([["\f\n\r\t\u0020\u00A0\u1680\u2028\u2029\u202F\u205F\u3000\uFEFF"], ["\u2000", "\u200A"]], true);
                }
            } else {
                return lexerRules.forChars([[escapedChar]], false);
            }
        } else if (tag.name === "Literal") {
            return caseSensitive ? AntlrExport._literalToTokens(tagValue, lexerRules)
                : `(${AntlrExport._literalToTokens(tagValue.toLowerCase(), lexerRules)} | ${AntlrExport._literalToTokens(tagValue.toUpperCase(), lexerRules)})`;
        } else {
            throw new Error("received tag was not a simpleChar: " + JSON.stringify(tag));
        }
    }

    /**
     * @param {string} expression
     * @param {boolean} greedy
     * @param {number} minRepeat
     * @param {number | undefined} maxRepeat
     * @return {string[]} quantified expression
     */
    static _quantifyForAntlr(expression, greedy, minRepeat, maxRepeat) {
        let greedyStr = (greedy ? "" : "?");
        let result = new Array(minRepeat).fill(expression);
        if (maxRepeat === undefined) {
            if (minRepeat <= 0) {
                result.push(expression);
                result.push("*" + greedyStr);
            } else {
                result.push("+" + greedyStr);
            }
        } else if (maxRepeat <= minRepeat) {
            // greedy does nothing for "exactly n"
        } else {
            let optRepeat = maxRepeat - minRepeat;
            for (let i = 0; i < optRepeat; i++) {
                result.push(expression);
                result.push("?" + greedyStr);
            }
        }
        return result;
    }

    /**
     * @param {LangTag[]} tags
     * @return {LangTag[]}
     * @private
     */
    static _flattenTags(tags) {
        return tags.concat(tags.flatMap(tag => AntlrExport._flattenTags(tag.subTags)));
    }

    /**
     * @param {LangTag[]} tags
     * @return {LangTag[][]} array of alternatives
     * @private
     */
    static _groupRegexAlternatives(tags) {
        let result = [];
        let currentAlternatives = [];
        for (let tag of tags) {
            if (tag.name === "Disjunction") {
                result.push(currentAlternatives);
                currentAlternatives = [];
            } else {
                currentAlternatives.push(tag)
            }
        }
        result.push(currentAlternatives);
        return result;
    }

    static LexerRuleHandler = class LexerRuleHandler {
        /**
         * @typedef OccupiedBounds
         * @property {number} minCode
         * @property {number} maxCode
         * @property {number} occupant
         */

        constructor() {
            /** @type {OccupiedBounds[]} */
            this.occupiedBounds = [];
            this.numParseRules = 0;
        }

        /**
         * @param {(string | number)[][]} chars
         * @param {boolean} negated
         * @return {string} the parser rule that will be generated
         */
        forChars(chars, negated) {
            // The core issue is that we cannot use the same character(s) for different lexer rules, only the first rule will create tokens for colliding
            // characters. ""Solution"" : keep track of all character sets used in lexer rules, collect them into ranges so we don't generate
            // inefficient alternative-rules like this: ('0' | '1' | ... | '9')

            /** @type {{min: number, max: number}[]} */
            let minMax = [];

            for (let range of chars) {
                if (range.length === 1) {
                    let exact = range[0];
                    if (exact === undefined) {
                        minMax.push({ min: 0, max: 0x10ffff });
                    } else if (typeof exact == "string") {
                        for (let i = 0; i < exact.length; i++) {
                            minMax.push({ min: exact.charCodeAt(i), max: exact.charCodeAt(i), });
                        }
                    } else {
                        minMax.push({ min: exact, max: exact });
                    }
                } else if (range.length === 2) {
                    range = range.map(x => {
                        if (typeof x == "string") {
                            if (x.length !== 1) {
                                throw new Error(`range str must be length 1 exactly, got ${JSON.stringify(x)} in ${JSON.stringify(range)}`);
                            }
                            return x.charCodeAt(0);
                        }
                        return x;
                    });
                    let start = range[0] === undefined ? 0 : range[0];
                    let end = range[1] === undefined ? 0x10ffff : range[1];
                    if (end < start) {
                        minMax.push({ min: end, max: start });
                    } else {
                        minMax.push({ min: start, max: end });
                    }
                } else {
                    throw new Error(`each entry in 'chars' must be length 1 or 2. got: ${JSON.stringify(chars)}`);
                }
            }

            minMax.sort((a, b) => a.min - b.min); // ascending
            /** @type {{min: number, max: number}[]} */
            let joinMinMax = [];
            /** @type {{min: number, max: number}} */
            let joined = undefined;
            for (let entry of minMax) {
                if (joined === undefined) {
                    joined = entry;
                    continue;
                }

                if ((joined.max + 1) >= entry.min) {
                    joined.max = Math.max(joined.max, entry.max);
                } else {
                    joinMinMax.push(joined);
                    joined = entry;
                }
            }
            if (joined !== undefined) {
                joinMinMax.push(joined);
            }

            if (negated) {
                /** @type {{min: number, max: number}[]} */
                let negatedMinMax = [];
                let curMin = 0;
                for (let joinEntry of joinMinMax) {
                    if (joinEntry.min > curMin) {
                        negatedMinMax.push({ min: curMin, max: joinEntry.min - 1 });
                    }
                    curMin = joinEntry.max + 1;
                }
                if (curMin < 0x10ffff) {
                    negatedMinMax.push({ min: curMin, max: 0x10ffff });
                }
                joinMinMax = negatedMinMax; // still sorted, just inverted
            }

            // sort entries into the array
            for (let joinEntry of joinMinMax) {
                this.occupiedBounds.push({ minCode: joinEntry.min, maxCode: joinEntry.max, occupant: this.numParseRules });
            }

            let parserRuleName = `cs_${this.numParseRules}`;
            this.numParseRules++;
            return parserRuleName;
        }

        /**
         * @return {string[]}
         */
        generateRules() {
            // generate a lexer rule for each non-overlapping section of the occupied bounds
            // then distribute those lexer rules to the requested parser rules as alternatives

            // Example:
            // [.....]         1
            //     [...]       2
            //            [..] 3
            // becomes:
            // [..][.][]  [..]
            // with:
            // 1 = (a | b)
            // 2 = (b | c)
            // 3 = (d)

            let splitPoints = Array.from(
                new Set(this.occupiedBounds.flatMap(bounds => [bounds.minCode, bounds.maxCode + 1]))
            ).sort((a, b) => a - b);

            let numLexerRules = 0;
            /** @type {Map<string, {min: number, max: number, occupants: number[], lexerRule: number}>} */
            let occupantsByBoundsStr = new Map();
            const addOrCreateOccupant = (min, max, occupant) => {
                let key = min + ":" + max;
                if (occupantsByBoundsStr.has(key)) {
                    occupantsByBoundsStr.get(key).occupants.push(occupant);
                } else {
                    occupantsByBoundsStr.set(key, { min: min, max: max, occupants: [occupant], lexerRule: numLexerRules, });
                    numLexerRules++;
                }
            }

            for (let bounds of this.occupiedBounds) {
                let curMin = bounds.minCode;
                for (let splitPoint of splitPoints) {
                    if (splitPoint <= bounds.minCode) {
                        continue;
                    }
                    if (splitPoint > bounds.maxCode) {
                        break;
                    }

                    addOrCreateOccupant(curMin, splitPoint - 1, bounds.occupant);
                    curMin = splitPoint;
                }
                if (curMin <= bounds.maxCode) {
                    addOrCreateOccupant(curMin, bounds.maxCode, bounds.occupant);
                }
            }

            /** @type {string[][]} */
            let parseAlternativesByIdx = new Array(this.numParseRules).fill(null).map(_ => []);
            /** @type {string[]} */
            let lexerRules = new Array(numLexerRules).fill("");
            for (let occupantBounds of occupantsByBoundsStr.values()) {
                let lexerRuleName = `C${occupantBounds.lexerRule}`;
                for (let occupant of occupantBounds.occupants) {
                    parseAlternativesByIdx[occupant].push(lexerRuleName);
                }

                if (occupantBounds.min === occupantBounds.max) {
                    let minStr = AntlrExport.toAntlrUnicodeHex(occupantBounds.min, 6);
                    lexerRules[occupantBounds.lexerRule] = `${lexerRuleName} : [\\u{${minStr}}] ;`
                } else {
                    let minStr = AntlrExport.toAntlrUnicodeHex(occupantBounds.min, 6);
                    let maxStr = AntlrExport.toAntlrUnicodeHex(occupantBounds.max, 6);
                    lexerRules[occupantBounds.lexerRule] = `${lexerRuleName} : [\\u{${minStr}}-\\u{${maxStr}}] ;`
                }
            }

            return parseAlternativesByIdx.map((alts, idx) => `cs_${idx} : ${alts.join(" | ")} ;`)
                .concat(lexerRules);
        }
    }
}