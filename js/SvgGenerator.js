const SvgGenerator = {
    /**
     * @param {number} width in pixels
     * @param {number} height in pixels
     * @param {string} svgStyle
     * @return {Templating.HtmlTemplateElement} svg element
     */
    svgElement: function svgElement(width, height, svgStyle) {
        return Templating.htmlNS(`
            <svg
                width="${width}px" height="${height}px" preserveAspectRatio="none"
                viewBox="0 0 ${width} ${height}"
                stroke-linecap="square"
                style="${svgStyle}"
            >
            </svg>`,
            "http://www.w3.org/2000/svg"
        );
    },

    /**
     * @param strokeSize
     * @return {function (HTMLElement): HTMLElement}
     */
    _applyStyle: (strokeSize) => {
        return (element) => {
            element.style.strokeWidth = `${strokeSize}px`;
            return element;
        }
    },

    /**
     * @param {number} width
     * @param {number} height
     * @param {number} strokeSize
     * @param {[number, number]} point
     * @return {[number, number]}
     * @private
     */
    _clipPoint: (width, height, strokeSize, point) => {
        strokeSize = strokeSize / 2;
        return [
            Math.max(strokeSize, Math.min(width - strokeSize, point[0])),
            Math.max(strokeSize, Math.min(height - strokeSize, point[1])),
        ];
    },

    /**
     * @param {number} width
     * @param {number} height
     * @param {number} strokeSize
     * @param {[number, number][]} points
     * @return {[number, number][]}
     * @private
     */
    _clipPoints: (width, height, strokeSize, points) => {
        return points.map(p => SvgGenerator._clipPoint(width, height, strokeSize, p));
    },

    /**
     * @param {number} width
     * @param {number} height
     * @param {number} strokeSize
     * @param {[number, number][][]} lines
     * @return {[number, number][][]}
     * @private
     */
    _clipLines: (width, height, strokeSize, lines) => {
        return lines.map(l => SvgGenerator._clipPoints(width, height, strokeSize, l));
    },

    /**
     * @param {number} width in pixels
     * @param {number} height in pixels
     * @param {number} strokeSize
     * @return {Templating.HtmlTemplateElement} svg element
     */
    stateDef: function stateDef(
        width,
        height,
        strokeSize,
    ) {
        let result = SvgGenerator.svgElement(width, height, "")
        const lines = SvgGenerator._clipLines(width, height, strokeSize, [
            [[0, 0], [width, 0], [width, height], [0, height], [0, 0]],
            [[strokeSize * 4, 0], [strokeSize * 4, height]],
            [[width - (strokeSize * 4), 0], [width - (strokeSize * 4), height]],
        ]);
        result.child(`
            <path
                d="${lines.map(l => "M" + l.map(p => p.join(" ")).join(" "))}"
                class="svg-element state-def"
            />`,
            SvgGenerator._applyStyle(strokeSize)
        );
        return result;
    },

    /**
     * @param {number} width in pixels
     * @param {number} height in pixels
     * @param {number} strokeSize
     * @return {Templating.HtmlTemplateElement} svg element
     */
    stateCall: function stateCall(
        width,
        height,
        strokeSize,
    ) {
        let result = SvgGenerator.svgElement(width, height, "")
        const diagXY = Math.min(width, height) / 2;

        const points = SvgGenerator._clipPoints(width, height, strokeSize, [
            [0, height - diagXY],
            [diagXY, height],
            [width - diagXY, height],
            [width, height - diagXY],
            [width, diagXY],
            [width - diagXY, 0],
            [diagXY, 0],
            [0, diagXY],
            [0, height - diagXY],
        ]);
        result.child(`
            <path
                d="M${points.map(p => p.join(" ")).join(" ")}"
                class="svg-element state-call"
            />`,
            SvgGenerator._applyStyle(strokeSize)
        );
        return result;
    },

    /**
     * @param {number} width in pixels
     * @param {number} height in pixels
     * @param {number} strokeSize
     * @return {Templating.HtmlTemplateElement} svg element
     */
    matchLiteral: function matchLiteral(
        width,
        height,
        strokeSize,
    ) {
        let result = SvgGenerator.svgElement(width, height, "")
        const points = SvgGenerator._clipPoints(width, height, strokeSize, [
            [0, 0],
            [width, 0],
            [width, height],
            [0, height],
            [0, 0],
        ]);
        result.child(`
            <path
                d="M${points.map(p => p.join(" ")).join(" ")}"
                class="svg-element match-literal"
            />`,
            SvgGenerator._applyStyle(strokeSize)
        );
        return result;
    },

    /**
     * @param {number} width in pixels
     * @param {number} height in pixels
     * @param {number} strokeSize
     * @return {Templating.HtmlTemplateElement} svg element
     */
    matchRegex: function matchRegex(
        width,
        height,
        strokeSize,
    ) {
        const slopeFactor = 0.5;
        const offset = (height / 2) * slopeFactor

        let svgStyle = `transform: translateX(${-offset}px);`
        let result = SvgGenerator.svgElement(width + (2 * offset), height, svgStyle)
        const points = SvgGenerator._clipPoints(width + (2 * offset), height, strokeSize, [
            [2 * offset, 0],
            [width + (2 * offset), 0],
            [width, height],
            [0, height],
            [2 * offset, 0],
        ]);
        result.child(`
            <path
                d="M${points.map(p => p.join(" ")).join(" ")}"
                class="svg-element match-regex"
            />`,
            SvgGenerator._applyStyle(strokeSize)
        );
        return result;
    },

    /**
     * @param {number} width in pixels
     * @param {number} height in pixels
     * @param {number} strokeSize
     * @return {Templating.HtmlTemplateElement} svg element
     */
    applyTag: function applyTag(
        width,
        height,
        strokeSize,
    ) {
        let result = SvgGenerator.svgElement(width, height, "");
        const points = SvgGenerator._clipPoints(width, height, strokeSize, [
            [0, height / 2],
            [width / 2, 0],
            [width, height / 2],
            [width / 2, height],
            [0, height / 2],
        ]);
        result.child(`
            <path
                d="M${points.map(p => p.join(" ")).join(" ")}"
                class="svg-element apply-tag"
            />`,
            SvgGenerator._applyStyle(strokeSize)
        );
        return result;
    },

    /**
     * @param {number} width in pixels
     * @param {number} height in pixels
     * @param {number} strokeSize
     * @return {Templating.HtmlTemplateElement}
     */
    chevronUp: function chevronUp(
        width,
        height,
        strokeSize,
    ) {
        let result = SvgGenerator.svgElement(width, height, "");
        result.element.classList.add("svg-chevron-up", "svg-hover-button");
        const points = SvgGenerator._clipPoints(width, height, strokeSize, [
            [0, height],
            [width / 2, 0],
            [width, height],
        ]);
        result.child(`
            <path
                d="M${points.map(p => p.join(" ")).join(" ")}"
                class="chevron-up"
            />`,
            SvgGenerator._applyStyle(strokeSize)
        );
        return result;
    },

    /**
     * @param {number} width in pixels
     * @param {number} height in pixels
     * @param {number} strokeSize
     * @return {Templating.HtmlTemplateElement}
     */
    chevronDown: function chevronDown(
        width,
        height,
        strokeSize,
    ) {
        let result = SvgGenerator.svgElement(width, height, "");
        result.element.classList.add("svg-chevron-down", "svg-hover-button");
        const points = SvgGenerator._clipPoints(width, height, strokeSize, [
            [0, 0],
            [width / 2, height],
            [width, 0],
        ]);
        result.child(`
            <path
                d="M${points.map(p => p.join(" ")).join(" ")}"
                class="chevron-down"
            />`,
            SvgGenerator._applyStyle(strokeSize)
        );
        return result;
    },

    /**
     * @param {number} width in pixels
     * @param {number} height in pixels
     * @param {number} strokeSize
     * @return {Templating.HtmlTemplateElement}
     */
    addCircle: function addCircle(
        width,
        height,
        strokeSize,
    ) {
        let result = SvgGenerator.svgElement(width, height, "");
        result.element.classList.add("svg-add-circle", "svg-hover-button");
        const circ = 0.23;
        const rCirc = 1 - circ;
        const plus = 0.3;
        const rPlus = 1 - plus;
        let segments = SvgGenerator._clipLines(width, height, strokeSize, [
            [[width * 0.5, 0]], // M
            [[width * rCirc, 0], [width, height * circ], [width, height * 0.5]], // C
            [[width, height * rCirc], [width * rCirc, height], [width * 0.5, height]], // C
            [[width * circ, height], [0, height * rCirc], [0, height * 0.5]], // C
            [[0, height * circ], [width * circ, 0], [width * 0.5, 0]], // C
            [[width * 0.5, height * plus]], // M
            [[width * 0.5, height * rPlus]], // L
            [[width * plus, height * 0.5]], // M
            [[width * rPlus, height * 0.5]], // L
        ]);
        let svgPath = ["M", "C", "C", "C", "C", "M", "L", "M", "L"]
            .map((type, i) => type + segments[i].map(p => p.join(" ")).join(" "))
            .join(" ");
        result.child(`
            <path
                d="${svgPath}"
                class="add-circle"
            />`,
            SvgGenerator._applyStyle(strokeSize)
        );
        return result;
    },

    /**
     * @param {number} width deltaX in pixels
     * @param {number} height deltaY in pixels
     * @param {number} strokeSize
     * @param {number} tipWidth
     * @return {Templating.HtmlTemplateElement}
     */
    arrow: function arrow(
        width,
        height,
        strokeSize,
        tipWidth,
    ) {
        width = Math.max(width, strokeSize);
        height = Math.max(height, strokeSize);
        let result = SvgGenerator.svgElement(width, height, "");
        result.element.classList.add("svg-arrow-line");
        const points = SvgGenerator._clipPoints(width, height, strokeSize, [
            [0, 0],
            [width / 2, 0],
            [width / 2, height],
            [width - tipWidth, height],
        ]);
        result.child(`
            <path
                d="M${points.map(p => p.join(" ")).join(" ")}"
                class="arrow-line"
            />`,
            SvgGenerator._applyStyle(strokeSize)
        );
        return result;
    },

    /**
     * @param {number} lineDx line deltaX in pixels
     * @param {number} lineDy line deltaY in pixels
     * @param {number} width  head width in pixels
     * @param {number} height head height in pixels
     * @param {number} strokeSize
     * @return {Templating.HtmlTemplateElement[]}
     */
    arrowBacktrack: function arrowBacktrack(
        lineDx,
        lineDy,
        width,
        height,
        strokeSize,
    ) {
        let line = SvgGenerator.arrow(lineDx, lineDy + strokeSize, strokeSize, width - strokeSize);
        line.element.style.translate = `100% ${-strokeSize / 2}px`

        let head = SvgGenerator.svgElement(width, height, "");
        head.element.classList.add("svg-arrow-head-backtrack");
        const points = SvgGenerator._clipPoints(width, height, strokeSize, [
            [0, height / 2],
            [width / 2, 0],
            [width, height / 2],
            [width / 2, height],
            [0, height / 2],
        ]);
        head.element.style.translate = `-100% -50%`
        head.child(`
            <path
                d="M${points.map(p => p.join(" ")).join(" ")}"
                class="arrow-head-backtrack"
            />`,
            SvgGenerator._applyStyle(strokeSize)
        );
        return [line, head];
    },

    /**
     * @param {number} lineDx line deltaX in pixels
     * @param {number} lineDy line deltaY in pixels
     * @param {number} width  head width in pixels
     * @param {number} height head height in pixels
     * @param {number} strokeSize
     * @return {Templating.HtmlTemplateElement[]}
     */
    arrowCommit: function arrowCommit(
        lineDx,
        lineDy,
        width,
        height,
        strokeSize,
    ) {
        let line = SvgGenerator.arrow(lineDx, lineDy + strokeSize, strokeSize, 0);
        line.element.style.translate = `100% ${-strokeSize / 2}px`

        let head = SvgGenerator.svgElement(width, height, "");
        head.element.classList.add("svg-arrow-head-commit");
        const points = SvgGenerator._clipPoints(width, height, strokeSize, [
            [0, 0],
            [width, height / 2],
            [width, height / 2],
            [0, height],
            [width / 2, height / 2],
            [0, 0],
        ]);
        head.element.style.translate = `-100% -50%`
        head.child(`
            <path
                d="M${points.map(p => p.join(" ")).join(" ")}"
                class="arrow-head-commit"
            />`,
            SvgGenerator._applyStyle(strokeSize)
        );
        return [line, head];
    },
}
