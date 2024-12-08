/**
 * @property {string} stateName
 *
 * Implements interface LangNode
 * @property {function(): NodeTypes} nodeType
 * @property {function(): function(number, number, number): Templating.HtmlTemplateElement} svgGenerator
 * @property {function(): string} contentText
 */
const LangNode_State = class LangNode_State {
    /** @returns {NodeTypes} */
    nodeType() {
        return NodeTypes.state;
    }

    /** @returns {function(number, number, number): Templating.HtmlTemplateElement} */
    svgGenerator() {
        return SvgGenerator.stateDef;
    }

    /** @returns {string} */
    contentText() {
        return this.stateName;
    }

    /**
     * @param {string} stateName
     */
    constructor(stateName) {
        this.stateName = stateName;
    }
}
