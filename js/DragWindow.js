const DragWindow = class DragWindow {
    /**
     * @param {HTMLElement} windowElement
     */
    constructor(windowElement) {
        this.windowElement = windowElement;
        this.isDragging = false;
        this.dragPointerOffset = [0, 0];

        windowElement.classList.add("window");

        let instance = this;
        document.addEventListener("pointerup", ev => {
            if (ev.button !== 0) {
                return;
            }
            instance.isDragging = false;
            instance.windowElement.style.zIndex = "0";
        });
        document.addEventListener("pointermove", ev => {
            if (!instance.isDragging) {
                return;
            }

            instance.windowElement.style.left = `${ev.clientX - instance.dragPointerOffset[0]}px`;
            instance.windowElement.style.top = `${ev.clientY - instance.dragPointerOffset[1]}px`;
        })
    }

    /**
     * @param {HTMLElement} handleElement
     */
    addDragHandle(handleElement) {
        let instance = this;
        handleElement.classList.add("window-drag-handle");
        handleElement.addEventListener("pointerdown", ev => {
            if (ev.button !== 0) {
                return;
            }

            instance.isDragging = true;
            instance.windowElement.style.zIndex = "100";
            let rect = instance.windowElement.getBoundingClientRect();
            instance.dragPointerOffset = [ev.clientX - rect.left, ev.clientY - rect.top];
        })
    }

    fold() {
        this.windowElement.classList.add("window-folded");
    }

    unfold() {
        this.windowElement.classList.remove("window-folded");
    }

    hide() {
        this.windowElement.classList.add("window-hidden");
    }

    /**
     * @param {number | undefined} anchorX
     * @param {number | undefined} anchorY
     */
    show(anchorX, anchorY) {
        this.windowElement.classList.remove("window-hidden");
        this.moveToAnchor(anchorX || 0.5, anchorY || 0.5);
    }

    moveToAnchor(x, y) {
        let winElement = this.windowElement;
        let windowRect = winElement.getBoundingClientRect();
        winElement.style.left = `${(window.innerWidth - windowRect.width) * x}px`;
        winElement.style.top = `${(window.innerHeight - windowRect.height) * y}px`;
    }
}
