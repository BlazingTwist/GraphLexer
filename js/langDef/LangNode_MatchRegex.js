/**
 * @property {string} regex
 *
 * Implements interface LangNode
 * @property {function(): NodeTypes} nodeType
 * @property {function(): function(number, number, number): Templating.HtmlTemplateElement} svgGenerator
 * @property {function(): string} contentText
 */
const LangNode_MatchRegex = class LangNode_MatchRegex {
    /** @returns {NodeTypes} */
    nodeType() {
        return NodeTypes.matchRegex;
    }

    /** @returns {function(number, number, number): Templating.HtmlTemplateElement} */
    svgGenerator() {
        return SvgGenerator.matchRegex;
    }

    /** @returns {string} */
    contentText() {
        return this.regex;
    }

    /**
     * @param {string} regex
     */
    constructor(regex) {
        this.regex = regex;
    }
}
