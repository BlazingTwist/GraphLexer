/**
 * @property {LangEvaluator} langEval
 * @property {DragWindow} dragWindow
 * @property {Templating.HtmlTemplateElement} inputField
 * @property {Templating.HtmlTemplateElement} matchCharOutput
 * @property {Templating.HtmlTemplateElement} matchOutput
 * @property {Templating.HtmlTemplateElement} tagsGrid
 * @property {Templating.HtmlTemplateElement} unmatchedCharOutput
 * @property {Templating.HtmlTemplateElement} unmatchedOutput
 * @property {Templating.HtmlTemplateElement} errorPanel
 * @property {Templating.HtmlTemplateElement} errorTitle
 * @property {Templating.HtmlTemplateElement} errorGrid
 */
const LanguageTester = class LanguageTester {
    /**
     * @returns {Templating.HtmlTemplateElement}
     * @private
     */
    _createLangInputPanel() {
        this.inputField = Templating.html(`<textarea style="white-space: pre; width: 300px; height: 500px;"></textarea>`);

        const instance = this;
        this.inputField.element.addEventListener("input", () => {
            /** @type {string} */
            let inputStr = instance.inputField.element.value;
            let startTime = Date.now();
            let evalResult = instance.langEval.evaluateAll(inputStr);
            let endTime = Date.now();

            let numUnmatched = (evalResult.unmatchedStr || "").length;
            let numMatched = inputStr.length - numUnmatched;

            instance.tagsGrid.element.innerHTML = ''; // remove children
            let formattedTextElement = Templating.html(`<span></span>`);
            let currentElementStack = [formattedTextElement];

            let curTextPos = 0;
            let tagIdx = 0;
            for (let rootTag of evalResult.result.tags) {
                /** @type {{tag: LangTag, tagIdx: number, isOpen: boolean}[]} */
                let tagMarkerStack = [{ tag: rootTag, tagIdx: tagIdx, isOpen: false }];
                tagIdx++;
                while (tagMarkerStack.length > 0) {
                    let tagMarker = tagMarkerStack.pop();
                    if (!tagMarker.isOpen) {
                        // entering tag
                        tagMarker.isOpen = true;
                        tagMarkerStack.push(tagMarker);

                        // push children
                        for (let i = tagMarker.tag.subTags.length - 1; i >= 0; i--) {
                            let child = tagMarker.tag.subTags[i];
                            tagMarkerStack.push({ tag: child, tagIdx: tagIdx, isOpen: false });
                            tagIdx++;
                        }

                        // advance text position
                        let tagTextPos = tagMarker.tag.index;
                        if (curTextPos < tagTextPos) {
                            let currentText = currentElementStack[currentElementStack.length - 1];
                            currentText.child(`<span>${inputStr.substring(curTextPos, tagTextPos)}</span>`);
                            curTextPos = tagTextPos;
                        } else if (curTextPos > tagTextPos) {
                            console.error("received non-sequential opening tag from Evaluator. Invalid Tag tree:");
                            console.error(rootTag);
                            throw new Error("Illegal Tag Order");
                        }

                        // apply tag style
                        let tagTextElement = Templating.html(`<span class="rainbow-${tagMarker.tagIdx % 11}"></span>`);
                        currentElementStack[currentElementStack.length - 1].child(tagTextElement);
                        currentElementStack.push(tagTextElement);

                        // add tag to tagGrid
                        let tagName = tagMarker.tag.name;
                        let tagStr = inputStr.substring(tagMarker.tag.index, tagMarker.tag.index + tagMarker.tag.len);
                        let tagDepth = currentElementStack.length - 2;
                        let label = Templating.html(`<span class="rainbow-${tagMarker.tagIdx % 11}" style="margin-left: ${tagDepth * 12}px;">${tagName}</span>`);
                        let strElement = Templating.html(`<span class="rainbow-${tagMarker.tagIdx % 11}">${tagStr}</span>`);

                        const onHoverTag = () => {
                            tagTextElement.element.classList.add("fmt-text-highlight");
                            tagTextElement.element.scrollIntoView({ behavior: "smooth", block: "center" });
                        }
                        label.element.addEventListener("pointerover", onHoverTag);
                        strElement.element.addEventListener("pointerover", onHoverTag);

                        const onHoverTagEnd = () => {
                            tagTextElement.element.classList.remove("fmt-text-highlight");
                        }
                        label.element.addEventListener("pointerout", onHoverTagEnd);
                        strElement.element.addEventListener("pointerout", onHoverTagEnd);

                        const onHoverText = () => {
                            label.element.classList.add("fmt-text-highlight");
                            label.element.scrollIntoView({ behavior: "smooth", block: "center" });
                            strElement.element.classList.add("fmt-text-highlight");
                        }
                        tagTextElement.element.addEventListener("pointerover", onHoverText);

                        const onHoverTextEnd = () => {
                            label.element.classList.remove("fmt-text-highlight");
                            strElement.element.classList.remove("fmt-text-highlight");
                        }
                        tagTextElement.element.addEventListener("pointerout", onHoverTextEnd);

                        instance.tagsGrid.child(label).child(strElement);
                    } else {
                        // exiting tag

                        // advance text position
                        let tagTextPos = tagMarker.tag.index + tagMarker.tag.len;
                        if (curTextPos < tagTextPos) {
                            let currentText = currentElementStack[currentElementStack.length - 1];
                            currentText.child(`<span>${inputStr.substring(curTextPos, tagTextPos)}</span>`);
                            curTextPos = tagTextPos;
                        } else if (curTextPos > tagTextPos) {
                            console.error("received non-sequential closing tag from Evaluator. Invalid Tag tree:");
                            console.error(rootTag);
                            throw new Error("Illegal Tag Order");
                        }

                        // apply tag style
                        currentElementStack.pop();
                    }
                }
            }
            if (curTextPos < numMatched) {
                let currentText = currentElementStack[currentElementStack.length - 1];
                currentText.child(`<span>${inputStr.substring(curTextPos, numMatched)}</span>`);
            }

            if(currentElementStack.length !== 1) {
                console.error("CurrentElementStack is in an illegal state:");
                console.error(currentElementStack);
                throw new Error("either closed to few or too many tags");
            }

            instance.matchCharOutput.element.innerHTML = `${numMatched} / ${inputStr.length} chars in ${endTime - startTime} ms`;
            instance.matchOutput.element.innerHTML = '';
            instance.matchOutput.child(formattedTextElement);

            instance.unmatchedCharOutput.element.innerHTML = `${numUnmatched} chars`;
            instance.unmatchedOutput.element.value = evalResult.unmatchedStr || "";

            instance.errorGrid.element.innerHTML = ''; // remove children
            if (evalResult.evalError === undefined) {
                instance.errorPanel.element.style.display = "none";
            } else {
                instance.errorPanel.element.style.removeProperty("display");
                let err = evalResult.evalError;
                instance.errorTitle.element.innerText = `${err.type}: ${err.message}`;

                let firstEntry = true;
                instance.errorGrid.child(`<span>State-Trace</span>`);
                for (let state of err.stateStack) {
                    if (firstEntry) {
                        firstEntry = false;
                    } else {
                        instance.errorGrid.child(`<span></span>`);
                    }
                    instance.errorGrid.child(`<span>${state}</span>`);
                }
                if (firstEntry) {
                    instance.errorGrid.child(`<span></span>`);
                }

                firstEntry = true;
                instance.errorGrid.child(`<span>Tag-Trace</span>`);
                for (let tag of err.tagStack) {
                    if (firstEntry) {
                        firstEntry = false;
                    } else {
                        instance.errorGrid.child(`<span></span>`);
                    }
                    instance.errorGrid.child(`<span>${tag}</span>`);
                }
                if (firstEntry) {
                    instance.errorGrid.child(`<span></span>`);
                }

                instance.errorGrid.child(`<span>Committed Input</span>`);
                instance.errorGrid.child(`<span>${err.committedInput}</span>`);
            }
        });

        return Templating.html(`<div style="display: flex; flex-direction: column;"></div>`)
            .child(Templating.html(`<span><b>Input</b></span>`))
            .child(this.inputField);
    }

    /**
     * @returns {Templating.HtmlTemplateElement}
     * @private
     */
    _createEvalPanel() {
        this.matchCharOutput = Templating.html(`<span>_ chars</span>`);
        this.matchOutput = Templating.html(`<span style="white-space: pre; width: 300px; height: 200px; overflow: auto; border: 1px solid black; background-color: #fff; resize: both;"></span>`);

        this.tagsGrid = Templating.html(`<div class="tester-grid" style="background-color: #fff; max-height: 25vh; overflow: auto;"></div>`);

        this.unmatchedCharOutput = Templating.html(`<span>_ chars</span>`);
        this.unmatchedOutput = Templating.html(`<textarea style="white-space: pre; width: 300px; height: 40px;" readonly></textarea>`);

        this.errorPanel = Templating.html(`<div class="evalEntryContainer"></div>`);
        this.errorTitle = Templating.html(`<b>SampleOutput: Start typing in the 'Input' field</b>`)
        this.errorGrid = Templating.html(`<div class="tester-grid" style="background-color: #fff; max-height: 25vh; overflow: auto;"></div>`);

        return Templating.html(`<div style="display: flex; flex-direction: column; gap: 15px;"></div>`)
            .child(Templating.html(`<div class="evalEntryContainer"></div>`)
                .child(Templating.html(`<div class="evalEntryTitleBar"></div>`)
                    .child(`<span><b>Matched Input</b></span>`)
                    .child(this.matchCharOutput)
                )
                .child(this.matchOutput)
            )
            .child(Templating.html(`<div class="evalEntryContainer"></div>`)
                .child(`<span><b>Tags</b></span>`)
                .child(this.tagsGrid
                    .child(`<span>a</span>`)
                    .child(`<span>b</span>`)
                    .child(`<span>b</span>`)
                    .child(`<span>b</span>`)
                )
            )
            .child(Templating.html(`<div class="evalEntryContainer"></div>`)
                .child(Templating.html(`<div class="evalEntryTitleBar"></div>`)
                    .child(`<span><b>Unmatched Input</b></span>`)
                    .child(this.unmatchedCharOutput)
                )
                .child(this.unmatchedOutput)
            )
            .child(this.errorPanel
                .child(Templating.html(`<span></span>`)
                    .child(this.errorTitle)
                )
                .child(this.errorGrid
                    .child(`<span>State-Trace</span>`)
                    .child(`<span>Program</span>`)
                    .child(`<span></span>`)
                    .child(`<span>Token_space</span>`)
                    .child(`<span></span>`)
                    .child(`<span>Token</span>`)
                    .child(`<span></span>`)
                    .child(`<span>String</span>`)
                    .child(`<span>Tag-Trace</span>`)
                    .child(`<span>StringLiteral</span>`)
                    .child(`<span>Committed Input</span>`)
                    .child(`<span>"unclosed</span>`)
                )
            );
    }

    /**
     * @param {LangEvaluator} langEval
     */
    constructor(langEval) {
        this.langEval = langEval;

        let windowHandle = Templating.html(`<div></div>`)
            .child(Templating.html(`<div style="display: flex; align-items: center; gap: 10px;"></div>`)
                .child(Templating.html(`<i class="fa-sm-green fa-bug"></i>`))
                .child(Templating.html(`<span>Language Tester</span>`))
            ).child(Templating.html(`<div style="display: flex; align-items: center; gap: 10px;"></div>`)
                .child(Templating.html(`<div style="background-color: #aaa; margin: 2px; border-radius: 4px; border: 1px solid #333; line-height: 0;"></div>`)
                    .child(Templating.html(`<i class="fa-sm fa-x-mark"></i>`))
                )
            );

        let langTestWindow = Templating.html(`<div style="background-color: #eee;"></div>`)
            .child(windowHandle)
            .child(Templating.html(`<div class="lang-tester-content" style="padding: 10px; display: flex; flex-direction: row; gap: 10px; font-size: 0.9em; max-width: 90vw; max-height: 80vh; overflow: auto"></div>`)
                .child(this._createLangInputPanel())
                .child(`<div style="width: 1px; background-color: black;"></div>`)
                .child(this._createEvalPanel())
            );

        this.dragWindow = new DragWindow(langTestWindow.element);
        this.dragWindow.addDragHandle(windowHandle.element);
    }
}
