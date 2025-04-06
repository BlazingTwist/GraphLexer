/**
 * @property {string} stateName
 * @implements LangNode
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
