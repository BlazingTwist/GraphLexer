/**
 * @typedef Repetition
 * @property {boolean} greedy
 * @property {number} minRepeat
 * @property {number | undefined} maxRepeat
 */

/**
 * @property {string} stateName
 * @property {Repetition} repetition
 *
 * Implements interface LangNode
 * @property {function(): NodeTypes} nodeType
 * @property {function(): function(number, number, number): Templating.HtmlTemplateElement} svgGenerator
 * @property {function(): string} contentText
 */
const LangNode_SubState = class LangNode_SubState {
    /** @returns {NodeTypes} */
    nodeType() {
        return NodeTypes.subState;
    }

    /** @returns {function(number, number, number): Templating.HtmlTemplateElement} */
    svgGenerator() {
        return SvgGenerator.stateCall;
    }

    /** @returns {string} */
    contentText() {
        let result = this.stateName;
        let minRepeat = this.repetition.minRepeat;
        let maxRepeat = this.repetition.maxRepeat;
        if (minRepeat === 1 && maxRepeat === 1) {
            // no special symbols for 'exactly once'
        } else if (minRepeat === 0 && maxRepeat === 1) {
            result += " ?";
        } else if (minRepeat === 0 && maxRepeat === undefined) {
            result += " *"
        } else if (minRepeat === 1 && maxRepeat === undefined) {
            result += " +"
        } else {
            result += `{${minRepeat},${maxRepeat}}`;
        }

        if (minRepeat !== maxRepeat && !this.repetition.greedy) {
            result += "?";
        }
        return result;
    }

    /**
     * @param {string} stateName
     * @param {Repetition | undefined} repetition (assumes {1,1} if undefined)
     */
    constructor(stateName, repetition) {
        this.stateName = stateName;
        this.repetition = repetition === undefined ? {greedy: false, minRepeat: 1, maxRepeat: 1} : repetition;
    }
}
