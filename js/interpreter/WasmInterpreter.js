/**
 * @typedef {number} Pointer
 */

/**
 * @typedef WasmInterpreter.WasmZigImpl
 * @property {function (logBufferPtr: Pointer, logBufferLen: number)} initLogger
 * @property {function (serializedPtr: Pointer, len: number, bufferPtr: Pointer, bufferLen: number)} loadLanguage
 * @property {function (modelPtr: Pointer, bufferPtr: Pointer, bufferLen: number)} getTagNames
 * @property {function (modelPtr: Pointer, bufferPtr: Pointer, bufferLen: number)} getStateNames
 * @property {function (modelPtr: Pointer, rootStateIdx: number, maxNoProgressTicks: number, inputPtr: Pointer, inputLen: number, bufferPtr: Pointer, bufferLen: number)} evaluate
 */

/**
 * @typedef WasmInterpreter.WasmJsImpl
 * @property {number} memPages
 * @property {WebAssembly.Memory} memory
 * @property {number} usedBytes
 * @property {function(msgPtr: Pointer, msgLen: number)} print
 * @property {function()} initLogger_outOfMemory
 * @property {function(): number} availableBytes
 * @property {function ()} loadLanguage_outOfMemory
 * @property {function (errPtr: Pointer, errLen: number)} loadLanguage_error
 * @property {function (modelPtr: Pointer, bytesAlloc: number)} loadLanguage_success
 * @property {function ()} getTagNames_outOfMemory
 * @property {function (numTags: number, nodeIndices: Pointer, tagNamePtrs: Pointer, tagNameLengths: Pointer )} getTagNames_success
 * @property {function ()} getStateNames_outOfMemory
 * @property {function (numStates: number, nodeIndices: Pointer, stateNamePtrs: Pointer, stateNameLengths: Pointer )} getStateNames_success
 * @property {function ()} evaluate_outOfMemory
 * @property {function (matchLen: number, tagsPtr: Pointer, tagsLen: number, failure: Pointer)} evaluate_success
 */

/**
 * @typedef WasmInterpreter.ScheduledAction
 * @template TSuccess
 * @template TFailure
 * @property {function()} action
 * @property {function(TSuccess)} success
 * @property {function(TFailure)} failure
 */

/**
 * @typedef WasmInterpreter.WasmController
 * @property {number} maxBytesAlloc
 * @property {WasmInterpreter.WasmZigImpl} _wasmZig
 * @property {WasmInterpreter.WasmJsImpl} _wasmJs
 * @property {WasmInterpreter.ScheduledAction[]} actionSchedule
 */

/**
 * @typedef WasmInterpreter.LanguageModel
 * @property {WasmInterpreter.WasmController} controller
 * @property {Pointer | undefined} modelPtr
 * @property {Object.<string, string> | undefined} tagNamesByIdx
 * @property {Object.<string, string> | undefined} stateNamesByIdx
 * @property {number} maxNoProgressTicks configuration option for the evaluator: maximum amount of states to visit without consuming any input
 */

/**
 * @typedef WasmInterpreter.WasmEvalResult_Internal
 * @property {number} len match length
 * @property {WasmInterpreter.WasmLangTag_Internal[]} tags
 * @property {WasmInterpreter.WasmEvalError_Internal | undefined} error
 */

/**
 * @typedef WasmInterpreter.WasmLangTag_Internal
 * @property {number} layerIdx
 * @property {number} nodeIdx
 * @property {number} index
 * @property {number} len
 */

/**
 * @typedef WasmInterpreter.WasmEvalError_Internal
 * @property {'InfiniteLoop' | 'NoMatch'} type
 * @property {string} message
 * @property {number[]} tagIdxStack
 * @property {number[]} stateIdxStack
 * @property {string} committedInput
 */

/**
 * @typedef WasmInterpreter.WasmEvalResult
 * @property {number} len match length
 * @property {WasmInterpreter.WasmLangTag[]} tags
 * @property {WasmInterpreter.WasmEvalError | undefined} error
 */

/**
 * @typedef WasmInterpreter.WasmLangTag
 * @property {string} tagName
 * @property {number} index
 * @property {number} len
 * @property {WasmInterpreter.WasmLangTag[]} subTags
 */

/**
 * @typedef WasmInterpreter.WasmEvalError
 * @property {'InfiniteLoop' | 'NoMatch'} type
 * @property {string} message
 * @property {string[]} tagStack
 * @property {string[]} stateStack
 * @property {string} committedInput
 */

const WasmInterpreter = {
    /** @type {WasmInterpreter.WasmController} */
    controllerInstance: undefined,

    /**
     * @param {number | undefined} maxBytesAlloc
     * @returns WasmInterpreter.WasmController
     */
    init(maxBytesAlloc) {
        if (WasmInterpreter.controllerInstance === undefined) {
            // noinspection JSValidateTypes
            WasmInterpreter.controllerInstance = new WasmInterpreter.WasmController(maxBytesAlloc);
        }

        return WasmInterpreter.controllerInstance;
    },

    /** @type {WasmInterpreter.WasmController} */
    WasmController: class WasmController {
        /**
         * @param {number | undefined} maxBytesAlloc
         */
        constructor(maxBytesAlloc) {
            if (WasmInterpreter.controllerInstance !== undefined) {
                throw new Error("WasmController is already instantiated. Instantiating more than one controller is not supported.");
            }

            this.pageSize = 64 * 1024; // https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory/grow
            if (maxBytesAlloc === undefined) {
                maxBytesAlloc = 2 * 1024 * 1024 * 1024; // 2 GiB - if you need more, pass an explicit limit, but still: wtf?
            }
            this.maxBytesAlloc = maxBytesAlloc;
            this.maxPagesAlloc = Math.ceil(maxBytesAlloc / this.pageSize);

            /**
             * @type {WasmInterpreter.WasmZigImpl}
             * @private
             */
            this._wasmZig = {
                initLogger: undefined,
                loadLanguage: undefined,
                getTagNames: undefined,
                getStateNames: undefined,
                evaluate: undefined,
            };

            // the wasm binary reserves some amount of pages for internal use
            // writing into these pages creates "fun" errors, so don't do it.
            // annoyingly, there is no (good) way to obtain the memory segment to determine this automatically...
            const reservedPages = 17;
            const initialPages = reservedPages + 8; // allocate 0.5 MiB for ourselves
            if (initialPages > this.maxPagesAlloc) {
                throw new Error(`Out of memory. Required ${initialPages * this.pageSize} bytes but only ${maxBytesAlloc} bytes were allowed.`)
            }
            let memory = new WebAssembly.Memory({
                initial: initialPages,
                maximum: this.maxPagesAlloc,
                shared: false
            });

            /**
             * @type {WasmInterpreter.WasmJsImpl}
             * @private
             */
            this._wasmJs = {
                memPages: initialPages,
                memory: memory,
                usedBytes: reservedPages * this.pageSize,
                availableBytes: this._availableBytes,
                print: this._print,
                initLogger_outOfMemory: this._initLogger_outOfMemory,
                loadLanguage_outOfMemory: this._growMemory,
                loadLanguage_error: this._loadLanguage_error,
                loadLanguage_success: this._loadLanguage_success,
                getTagNames_outOfMemory: this._growMemory,
                getTagNames_success: this._getTagNames_success,
                getStateNames_outOfMemory: this._growMemory,
                getStateNames_success: this._getStateNames_success,
                evaluate_outOfMemory: this._growMemory,
                evaluate_success: this._evaluate_success,
            };

            // mark controller as busy until the library is loaded and the logger is ready
            /** @type {WasmInterpreter.ScheduledAction[]} */
            this.actionSchedule = [undefined]; // lock actions until logger is initialized

            const self = this;
            /**
             * @param {WebAssemblyInstantiatedSource} wasmInstance
             * @param {string} fnName
             * @return {function}
             */
            const resolveExportFn = (wasmInstance, fnName) => {
                const fn = wasmInstance.instance.exports[fnName];
                if (fn === undefined) {
                    throw new Error(`Wasm Implementation does not export function ${fn}`);
                }
                return fn;
            }

            /** @param {Response} data */
            const initWasm = (data) => {
                data.blob()
                    .then(blob => new Response(blob.stream(), {headers: {"Content-Type": "application/wasm"}}).arrayBuffer())
                    .then(wasmBuffer => WebAssembly.instantiate(wasmBuffer, {
                        env: self._wasmJs
                    }))
                    .then(wasmInstance => {
                        self._wasmZig.initLogger = resolveExportFn(wasmInstance, "initLogger");
                        self._wasmZig.loadLanguage = resolveExportFn(wasmInstance, "loadLanguage");
                        self._wasmZig.getTagNames = resolveExportFn(wasmInstance, "getTagNames");
                        self._wasmZig.getStateNames = resolveExportFn(wasmInstance, "getStateNames");
                        self._wasmZig.evaluate = resolveExportFn(wasmInstance, "evaluate");

                        const maxLogMessageLen = 10 * 1024;
                        const bufferPtr = self._wasmJs.usedBytes;
                        self._wasmJs.usedBytes += maxLogMessageLen;
                        self._wasmZig.initLogger(bufferPtr, maxLogMessageLen);

                        self._actionComplete();
                    });
            }

            fetch("/interpreter/zig-out/bin/GraphLexer-Wasm.wasm")
                .then(initWasm)
                .catch(_ => {
                    const fallbackPath = "/js/interpreter/GraphLexer-Wasm.wasm";
                    console.debug(`fallback to ${fallbackPath}`);
                    fetch(fallbackPath)
                        .then(initWasm)
                        .catch(reason => {
                            console.error(`Failed to load GraphLexer: ${reason}`);
                        });
                });
        }

        /**
         * @param {string} serialized
         * @param {function(Pointer)} onSuccess receives the modelPtr
         * @param {function(string)} onFailure receives a failure message
         */
        loadModel(serialized, onSuccess, onFailure) {
            const self = this;

            const executeAction = () => {
                const wasmJs = self._wasmJs;
                const serializedPtr = wasmJs.usedBytes;
                let encodeResult = new TextEncoder().encodeInto(serialized, new Uint8Array(wasmJs.memory.buffer, serializedPtr));
                const serializedLen = encodeResult.written;
                wasmJs.usedBytes += serializedLen;
                self._wasmZig.loadLanguage(serializedPtr, serializedLen, wasmJs.usedBytes, self._availableBytes());
                // callbacks are resolved in '_loadLanguage_error' or '_loadLanguage_success'
            }


            self._scheduleAction(executeAction, onSuccess, onFailure);
        }

        /**
         * @param {WasmInterpreter.LanguageModel} model
         * @param {function(Object.<string, string>)} onSuccess receives tagNamesByIdx
         * @param {function(string)} onFailure receives a failure message
         */
        getTagNames(model, onSuccess, onFailure) {
            const self = this;
            const executeAction = () => {
                if (model.modelPtr === undefined) {
                    self.actionSchedule[0].failure("LanguageModel contains no model data");
                    self._actionComplete();
                    return;
                }

                self._wasmZig.getTagNames(model.modelPtr, self._wasmJs.usedBytes, self._availableBytes());
            }

            self._scheduleAction(executeAction, onSuccess, onFailure);
        }

        /**
         * On Success, calls resolve with {Object.<string, string>} stateNamesByIndex
         * On Failure, calls reject with {string} error message
         * @param {WasmInterpreter.LanguageModel} model
         * @param {function(Object.<string, string>)} onSuccess receives stateNamesByIdx
         * @param {function(string)} onFailure receives a failure message
         */
        getStateNames(model, onSuccess, onFailure) {
            const self = this;
            const executeAction = () => {
                if (model.modelPtr === undefined) {
                    self.actionSchedule[0].failure("LanguageModel contains no model data");
                    self._actionComplete();
                    return;
                }

                self._wasmZig.getStateNames(model.modelPtr, self._wasmJs.usedBytes, self._availableBytes());
            }

            self._scheduleAction(executeAction, onSuccess, onFailure);
        }

        /**
         * @param {WasmInterpreter.LanguageModel} model
         * @param {number} rootStateIdx
         * @param {string} input
         * @param {function(WasmInterpreter.WasmEvalResult_Internal)} onSuccess
         */
        evaluate(model, rootStateIdx, input, onSuccess) {
            const self = this;
            const executeAction = () => {
                if (model.modelPtr === undefined) {
                    self.actionSchedule[0].failure("LanguageModel contains no model data");
                    self._actionComplete();
                    return;
                }

                const inputPtr = self._wasmJs.usedBytes;
                const encodedInput = new TextEncoder().encodeInto(input, new Uint8Array(self._wasmJs.memory.buffer, self._wasmJs.usedBytes));
                const inputLen = encodedInput.written;
                const bufferPtr = self._wasmJs.usedBytes + inputLen;
                const bufferLen = self._availableBytes() - inputLen;
                self._wasmZig.evaluate(model.modelPtr, rootStateIdx, model.maxNoProgressTicks, inputPtr, inputLen, bufferPtr, bufferLen);
            }

            self._scheduleAction(executeAction, onSuccess, () => console.error("Model evaluation failed even though it can never fail according to spec..."));
        }

        /**
         * @param {function()} action
         * @param {function(*)} onSuccess
         * @param {function(*)} onFailure
         * @private
         */
        _scheduleAction(action, onSuccess, onFailure) {
            // Note: Promises don't work for this, since their resolve/reject callbacks are not executed immediately.
            const self = WasmInterpreter.controllerInstance;
            self.actionSchedule.push({
                action: action,
                success: onSuccess,
                failure: onFailure,
            });
            if (self.actionSchedule.length === 1) {
                action();
            }
        }

        _actionComplete() {
            const self = WasmInterpreter.controllerInstance;
            self.actionSchedule.splice(0, 1);
            if (self.actionSchedule.length > 0) {
                self.actionSchedule[0].action();
            }
        }

        _availableBytes() {
            const self = WasmInterpreter.controllerInstance;
            return (self._wasmJs.memPages * 64 * 1024) - self._wasmJs.usedBytes;
        }

        _initLogger_outOfMemory() {
            console.error("Failed to init logger. Out of memory (how?)");
        }

        _print(msgPtr, msgLen) {
            // Note: 'this' does NOT work for these wasm callbacks, you MUST use the global variable.
            const self = WasmInterpreter.controllerInstance;
            console.log(self._readMemoryString(msgPtr, msgLen));
        }

        _growMemory() {
            // Note: 'this' does NOT work for these wasm callbacks, you MUST use the global variable.
            const self = WasmInterpreter.controllerInstance;
            const addPages = Math.floor(self._wasmJs.memPages * 0.5) + 1;
            const newPages = self._wasmJs.memPages + addPages;

            if (newPages > self.maxPagesAlloc) {
                throw new Error(`tried to allocate ${newPages * self.pageSize} bytes, but only ${self.maxBytesAlloc} bytes were allowed.`);
            }

            console.log(`resizing buffer from ${self._wasmJs.memPages} to ${newPages} pages (= ${newPages * 64} KiB)`);
            self._wasmJs.memory.grow(addPages);
            self._wasmJs.memPages = newPages;

            if (self.actionSchedule.length > 0) {
                self.actionSchedule[0].action();
            }
        }

        /**
         * @param {Pointer} pos
         * @param {number} len
         * @returns {string}
         */
        _readMemoryString(pos, len) {
            const self = WasmInterpreter.controllerInstance;
            let strView = new DataView(self._wasmJs.memory.buffer, pos, len);
            return new TextDecoder().decode(strView);
        }

        _loadLanguage_error(errPtr, errLen) {
            // Note: 'this' does NOT work for these wasm callbacks, you MUST use the global variable.
            const self = WasmInterpreter.controllerInstance;
            self.actionSchedule[0].failure(self._readMemoryString(errPtr, errLen));
            self._actionComplete();
        };

        _loadLanguage_success(modelPtr, bytesAlloc) {
            // Note: 'this' does NOT work for these wasm callbacks, you MUST use the global variable.
            const self = WasmInterpreter.controllerInstance;
            self._wasmJs.usedBytes += bytesAlloc;
            self.actionSchedule[0].success(modelPtr);
            self._actionComplete();
        }

        _getTagNames_success(numTags, nodeIndices, tagNamePtrs, tagNameLengths) {
            // Note: 'this' does NOT work for these wasm callbacks, you MUST use the global variable.
            const self = WasmInterpreter.controllerInstance;

            if (numTags < 0) {
                self.actionSchedule[0].failure(`Received negative amount of tags: ${numTags}`);
                self._actionComplete();
                return;
            }

            let tagNamesByIdx = {};
            if (numTags > 0) {
                let nodeIdxArray = new Uint32Array(self._wasmJs.memory.buffer, nodeIndices, numTags);
                let namePtrArray = new Uint32Array(self._wasmJs.memory.buffer, tagNamePtrs, numTags);
                let nameLenArray = new Uint32Array(self._wasmJs.memory.buffer, tagNameLengths, numTags);

                for (let i = 0; i < numTags; i++) {
                    tagNamesByIdx[`${nodeIdxArray.at(i)}`] = self._readMemoryString(namePtrArray.at(i), nameLenArray.at(i));
                }
            }
            // memory can now safely be discarded. leave usedBytes unchanged.

            self.actionSchedule[0].success(tagNamesByIdx);
            self._actionComplete();
        }

        _getStateNames_success(numStates, nodeIndices, stateNamePtrs, stateNameLengths) {
            // Note: 'this' does NOT work for these wasm callbacks, you MUST use the global variable.
            const self = WasmInterpreter.controllerInstance;
            if (numStates < 0) {
                self.actionSchedule[0].failure(`Received negative amount of states: ${numStates}`);
                self._actionComplete();
                return;
            }


            let stateNamedByIdx = {};
            if (numStates > 0) {
                let nodeIdxArray = new Uint32Array(self._wasmJs.memory.buffer, nodeIndices, numStates);
                let namePtrArray = new Uint32Array(self._wasmJs.memory.buffer, stateNamePtrs, numStates);
                let nameLenArray = new Uint32Array(self._wasmJs.memory.buffer, stateNameLengths, numStates);

                for (let i = 0; i < numStates; i++) {
                    stateNamedByIdx[`${nodeIdxArray.at(i)}`] = self._readMemoryString(namePtrArray.at(i), nameLenArray.at(i));
                }
            }
            // memory can now safely be discarded. leave usedBytes unchanged.

            self.actionSchedule[0].success(stateNamedByIdx);
            self._actionComplete();
        }

        _evaluate_success(matchLen, tagsPtr, tagsLen, failure) {
            // Note: 'this' does NOT work for these wasm callbacks, you MUST use the global variable.
            const self = WasmInterpreter.controllerInstance;

            /** @type {WasmInterpreter.WasmLangTag_Internal[]} */
            let tagsFlatList = [];

            if (tagsLen > 0) {
                const tagsStructArray = new Uint32Array(self._wasmJs.memory.buffer, tagsPtr, 4 * tagsLen);
                for (let tagI = 0; tagI < tagsLen; tagI++) {
                    const i = tagI * 4;
                    tagsFlatList.push({
                        layerIdx: tagsStructArray.at(i),
                        nodeIdx: tagsStructArray.at(i + 1),
                        index: tagsStructArray.at(i + 2),
                        len: tagsStructArray.at(i + 3),
                    });
                }
            }

            /** @type {WasmInterpreter.WasmEvalError_Internal} */
            let failureObj = undefined;
            if (failure !== 0) {
                const failureStruct = new Uint32Array(self._wasmJs.memory.buffer, failure, 10);

                const tagStackPtr = failureStruct.at(4);
                const tagStackLen = failureStruct.at(5);
                const stateStackPtr = failureStruct.at(6);
                const stateStackLen = failureStruct.at(7);

                /** @type {number[]} */
                const tagIdxStack = [];
                /** @type {number[]} */
                const stateIdxStack = [];

                if (tagStackLen > 0) {
                    const tagIdxArray = new Uint32Array(self._wasmJs.memory.buffer, tagStackPtr, tagStackLen);
                    for (let i = 0; i < tagStackLen; i++) {
                        tagIdxStack.push(tagIdxArray.at(i));
                    }
                }

                if (stateStackLen > 0) {
                    const stateIdxArray = new Uint32Array(self._wasmJs.memory.buffer, stateStackPtr, stateStackLen);
                    for (let i = 0; i < stateStackLen; i++) {
                        stateIdxStack.push(stateIdxArray.at(i));
                    }
                }

                failureObj = {
                    type: self._readMemoryString(failureStruct.at(0), failureStruct.at(1)),
                    message: self._readMemoryString(failureStruct.at(2), failureStruct.at(3)),
                    tagIdxStack: tagIdxStack,
                    stateIdxStack: stateIdxStack,
                    committedInput: self._readMemoryString(failureStruct.at(8), failureStruct.at(9)),
                };
            }

            /** @type {WasmInterpreter.WasmEvalResult_Internal} */
            const resultData = {
                len: matchLen,
                tags: tagsFlatList,
                error: failureObj,
            };

            // memory can now safely be discarded. leave usedBytes unchanged.

            self.actionSchedule[0].success(resultData);
            self._actionComplete();
        }
    },

    /** @type {WasmInterpreter.LanguageModel} */
    LanguageModel: class LanguageModel {
        /**
         * @param {string} serializedModel
         */
        constructor(serializedModel) {
            const controller = WasmInterpreter.init(undefined);
            this.controller = controller;
            this.modelPtr = undefined;
            this.tagNamesByIdx = undefined;
            this.stateNamesByIdx = undefined;
            this.maxNoProgressTicks = 1000;

            const self = this;
            controller.loadModel(
                serializedModel,
                modelPtr => self.modelPtr = modelPtr,
                err => console.error(`Failed to load model: ${err}`)
            );
            controller.getTagNames(
                this,
                tagNamesByIdx => self.tagNamesByIdx = tagNamesByIdx,
                errMsg => console.error(`Failed to resolve tag names: ${errMsg}`)
            );
            controller.getStateNames(
                this,
                stateNamesByIdx => self.stateNamesByIdx = stateNamesByIdx,
                errMsg => console.error(`Failed to resolve state names: ${errMsg}`)
            );
        }

        /**
         * @param {number} rootStateIdx
         * @param {string} input
         * @param {function(WasmInterpreter.WasmEvalResult)} callback
         */
        evaluate(rootStateIdx, input, callback) {
            const self = this;

            /**
             * @param {WasmInterpreter.WasmLangTag_Internal[]} tagsFlat
             * @returns WasmInterpreter.WasmLangTag[]
             */
            const convertTagTree = (tagsFlat) => {
                if (tagsFlat.length <= 0) {
                    return [];
                }

                const rootLayer = tagsFlat[tagsFlat.length - 1].layerIdx;
                let childStartIdx = 0;
                let i = 0;
                /** @type {WasmInterpreter.WasmLangTag[]} */
                let result = [];
                for (let tagFlat of tagsFlat) {
                    if (tagFlat.layerIdx === rootLayer) {
                        result.push({
                            tagName: self.tagNamesByIdx[`${tagFlat.nodeIdx}`],
                            index: tagFlat.index,
                            len: tagFlat.len,
                            subTags: convertTagTree(tagsFlat.slice(childStartIdx, i)),
                        });

                        childStartIdx = i + 1;
                    }
                    i++;
                }
                return result;
            }

            /**
             * @param {number[]} tagIndices
             * @returns string[]
             */
            const convertTagIdx = (tagIndices) => {
                return tagIndices.map(i => self.tagNamesByIdx[`${i}`]);
            }

            /**
             * @param {number[]} stateIndices
             * @returns string[]
             */
            const convertStateIdx = (stateIndices) => {
                return stateIndices.map(i => self.stateNamesByIdx[`${i}`]);
            }

            this.controller.evaluate(
                this, rootStateIdx, input,
                evalResult => {
                    const err = evalResult.error;

                    /** @type {WasmInterpreter.WasmEvalResult} */
                    const result = {
                        len: evalResult.len,
                        tags: convertTagTree(evalResult.tags),
                        error: err === undefined ? undefined : {
                            type: err.type,
                            message: err.message,
                            tagStack: convertTagIdx(err.tagIdxStack),
                            stateStack: convertStateIdx(err.stateIdxStack),
                            committedInput: err.committedInput,
                        }
                    };
                    callback(result);
                }
            );
        }
    },
}
