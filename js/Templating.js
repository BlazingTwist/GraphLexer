const Templating = {

    HtmlTemplateElement: class HtmlTemplateElement {
        /**
         * @param {HTMLElement} element
         * @param {string} namespace
         */
        constructor(element, namespace) {
            this.element = element;
            this.namespace = namespace;
        }

        /**
         * @param {string | HTMLElement | Templating.HtmlTemplateElement | string[] | HTMLElement[] | Templating.HtmlTemplateElement[]} children an html-string, html-element or array of either to add as the children of this
         * element.
         * @param {function (HTMLElement): HTMLElement =} styleMapper
         * @return {Templating.HtmlTemplateElement}
         */
        child(children, styleMapper) {
            if (!children) {
                return this;
            }

            if (styleMapper === undefined) {
                styleMapper = x => x;
            }

            const ns = this.namespace;

            function _html(html) {
                if (ns) {
                    return Templating.htmlNS(html, ns);
                } else {
                    return Templating.html(html);
                }
            }

            const type = typeof (children);
            if (type === 'string') {
                this.element.appendChild(styleMapper(_html(children).element));
            } else if (type === 'object') {
                if (Array.isArray(children)) {
                    if (children.length <= 0) {
                        return this;
                    }

                    if (typeof (children[0]) === 'string') {
                        for (let child of children) {
                            this.element.appendChild(styleMapper(_html(child).element));
                        }
                    } else {
                        for (let child of children) {
                            if (child instanceof Templating.HtmlTemplateElement) {
                                this.element.appendChild(styleMapper(child.element));
                            } else {
                                this.element.appendChild(styleMapper(child));
                            }
                        }
                    }
                } else if (children instanceof Templating.HtmlTemplateElement) {
                    this.element.appendChild(styleMapper(children.element));
                } else {
                    // assuming HTMLElement
                    this.element.appendChild(styleMapper(children));
                }
            }

            return this;
        }
    },

    /**
     * @param {string} htmlString representing a single element
     * @return {Templating.HtmlTemplateElement}
     */
    html: function html(htmlString) {
        let template = document.createElement('template');
        template.innerHTML = htmlString.trim();
        // noinspection JSCheckFunctionSignatures
        return new Templating.HtmlTemplateElement(template.content.firstChild, null);
    },

    /**
     * @param {string} htmlString representing a single element
     * @param {string} namespace
     * @return {Templating.HtmlTemplateElement}
     */
    htmlNS: function htmlNS(htmlString, namespace) {
        let template = document.createElementNS(namespace, 'template');
        template.innerHTML = htmlString.trim();
        // noinspection JSCheckFunctionSignatures
        return new Templating.HtmlTemplateElement(template.firstChild, namespace);
    },
}
