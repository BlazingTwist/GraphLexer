/**
 * @property {string} tagName
 * @implements LangNode
 */
const LangNode_ApplyTag = class LangNode_ApplyTag {
    /** @returns {NodeTypes} */
    nodeType() {
        return NodeTypes.applyTag;
    }

    /** @returns {function(number, number, number): Templating.HtmlTemplateElement} */
    svgGenerator() {
        return SvgGenerator.applyTag;
    }

    /** @returns {string} */
    contentText() {
        return this.tagName;
    }

    /**
     * @param {string} tagName
     */
    constructor(tagName) {
        this.tagName = tagName;
    }
}
