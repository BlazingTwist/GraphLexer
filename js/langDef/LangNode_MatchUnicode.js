/**
 * @typedef CharCodeConstraint
 * @property {number | undefined} minCodeInclusive
 * @property {number | undefined} maxCodeInclusive
 */

/**
 * @property {CharCodeConstraint} charCodeConstraint
 * @implements LangNode
 */
const LangNode_MatchUnicode = class LangNode_MatchUnicode {
    /** @returns {NodeTypes} */
    nodeType() {
        return NodeTypes.matchUnicode;
    }

    /** @returns {function(number, number, number): Templating.HtmlTemplateElement} */
    svgGenerator() {
        return SvgGenerator.matchLiteral;
    }

    /** @returns {string} */
    contentText() {
        let result = "";
        if (this.charCodeConstraint.minCodeInclusive !== undefined) {
            result += (this.charCodeConstraint.minCodeInclusive - 1) + " < ";
        }
        result += "charCode";
        if (this.charCodeConstraint.maxCodeInclusive !== undefined) {
            result += " < " + (this.charCodeConstraint.maxCodeInclusive + 1);
        }
        return result;
    }

    /**
     * @param {CharCodeConstraint} charCodeConstraint
     */
    constructor(charCodeConstraint) {
        this.charCodeConstraint = charCodeConstraint;
    }
}
