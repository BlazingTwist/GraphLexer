/**
 * @property {string} literalText
 *
 * Implements interface LangNode
 * @property {function(): NodeTypes} nodeType
 * @property {function(): function(number, number, number): Templating.HtmlTemplateElement} svgGenerator
 * @property {function(): string} contentText
 */
const LangNode_MatchLiteral = class LangNode_MatchLiteral {
    /** @returns {NodeTypes} */
    nodeType() {
        return NodeTypes.matchLiteral;
    }

    /** @returns {function(number, number, number): Templating.HtmlTemplateElement} */
    svgGenerator() {
        return SvgGenerator.matchLiteral;
    }

    /** @returns {string} */
    contentText() {
        return this.literalText;
    }

    /**
     * @param {string} literalText
     */
    constructor(literalText) {
        this.literalText = literalText;
    }
}
