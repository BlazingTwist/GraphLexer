const std = @import("std");

const LangNodes = @import("lang/Nodes.zig");
const LangTreeNode = LangNodes.LangTreeNode;

const Evaluator = @import("lang/Evaluator.zig");
const EvalAllResultFlat = Evaluator.EvalAllResultFlat;
const LangTagTree = Evaluator.LangTagTree;

const Deserializer = @import("lang/Deserializer.zig");
const DeserializeError = Deserializer.DeserializeError;

pub const std_options = .{
    .log_level = .debug,
    // Define logFn to override the std implementation
    .logFn = wasmLogFn,
};

const logger = std.log.scoped(.GraphLexer);
var logAlloc: ?std.mem.Allocator = null;

pub fn wasmLogFn(
    comptime level: std.log.Level,
    comptime scope: @TypeOf(.EnumLiteral),
    comptime format: []const u8,
    args: anytype,
) void {
    if (logAlloc) |alloc| {
        const prefixedFmt = comptime "[" ++ level.asText() ++ "] (" ++ @tagName(scope) ++ ") " ++ format;
        printFmt(alloc, prefixedFmt, args);
    }
}

// =========
// Debugging

extern fn print(msgPtr: [*]const u8, msgLen: usize) void;

extern fn initLogger_outOfMemory() void;

export fn initLogger(logBufferPtr: [*]u8, logBufferLen: usize) void {
    const buffer: []u8 = logBufferPtr[0..logBufferLen];

    // okay, hear me out... logging does not work unless I allocate the fba into the shared memory.
    // Storing it in the program memory (the same way 'logAlloc' is stored) does not work.
    var tempFba = std.heap.FixedBufferAllocator.init(buffer);
    var fbaPersist = tempFba.allocator().alloc(std.heap.FixedBufferAllocator, 1) catch {
        initLogger_outOfMemory();
        return;
    };
    fbaPersist[0] = std.heap.FixedBufferAllocator.init(buffer[tempFba.end_index..]);
    logAlloc = fbaPersist[0].allocator();
}

fn printFmt(alloc: std.mem.Allocator, comptime fmt: []const u8, args: anytype) void {
    if (std.fmt.allocPrint(alloc, fmt, args)) |msg| {
        print(msg.ptr, msg.len);
        // from limited testing, it seems that the extern print call blocks for long enough to print the message, so it *might* be safe to release it already.
        // I'm okay with the risk, since this is for debugging only.
        alloc.free(msg);
    } else |_| {
        if (std.fmt.allocPrint(alloc, "Log message was too long. Message pattern: {s}", .{fmt})) |msg| {
            print(msg.ptr, msg.len);
            alloc.free(msg);
        } else |_| {}
    }
}

// ===============
// Deserialization

/// invoked if 'loadLanguage' failed because it ran out of memory
extern fn loadLanguage_outOfMemory() void;

/// invoked if 'loadLanguage' fails for any reason other than 'OutOfMemory'
/// 'err' will be the error name as defined in 'DeserializeError'
extern fn loadLanguage_error(errPtr: [*]const u8, errLen: usize) void;

/// invoked if 'loadLanguage' succeeds.
/// The Model can then be (re-)used for running the Evaluator
/// Arguments:
/// - modelPtr a pointer that can be passed to an evaluator
/// - bytesAlloc the amount of bytes used by the language model, used for memory-bookkeeping
extern fn loadLanguage_success(modelPtr: *const std.ArrayList(LangTreeNode), bytesAlloc: usize) void;

/// Deserializes a language model for subsequent use with an Evaluator
///
/// the serialized model needs to be kept in memory for the lifetime of the deserialized model
export fn loadLanguage(serialized: [*]const u8, len: usize, bufferPtr: [*]u8, bufferLen: usize) void {
    const buffer: []u8 = bufferPtr[0..bufferLen];
    var fba = std.heap.FixedBufferAllocator.init(buffer);
    const alloc = fba.allocator();

    const model = Deserializer.deserialize(alloc, serialized[0..len]) catch |ex| {
        if (ex == DeserializeError.OutOfMemory) {
            loadLanguage_outOfMemory();
            return;
        }

        const errName: [:0]const u8 = @errorName(ex);
        if (errName.len > bufferLen) {
            loadLanguage_outOfMemory();
            return;
        }

        std.mem.copyForwards(u8, buffer, errName);
        loadLanguage_error(bufferPtr, errName.len);
        return;
    };

    loadLanguage_success(model, fba.end_index);
}

// ===============================
// Data queries on Language Models

extern fn getTagNames_outOfMemory() void;

/// invoked if 'getTagNames' succeeds
/// Arguments:
/// - numTags is the length for the 'nodeIndices', 'tagNamePtrs' and 'tagNameLengths' arrays.
/// - nodeIndices contains the index of the tag node
/// - tagNamePtrs contains the start of the tag name
/// - tagNameLengths contains the length of the tag name
extern fn getTagNames_success(numTags: u32, nodeIndices: [*]const u32, tagNamePtrs: [*]const u32, tagNameLengths: [*]const u32) void;

/// This resolves the tag names and corresponding node indices.
/// This is needed to obtain tag names from evaluation results.
///
/// Memory allocated for this function is never reused and can safely be discarded after the call returns
export fn getTagNames(modelPtr: *const std.ArrayList(LangTreeNode), bufferPtr: [*]u8, bufferLen: usize) void {
    const buffer: []u8 = bufferPtr[0..bufferLen];
    var fba = std.heap.FixedBufferAllocator.init(buffer);
    const alloc = fba.allocator();

    if (storeNodeStrings(modelPtr, alloc, getTagName)) |result| {
        getTagNames_success(result[0].items.len, result[0].items.ptr, result[1].items.ptr, result[2].items.ptr);
    } else |_| {
        getTagNames_outOfMemory();
    }
}

fn getTagName(node: *const LangTreeNode) ?[]const u8 {
    return switch (node.node.*) {
        .ApplyTag => |tag| tag.tagName,
        else => null,
    };
}

extern fn getStateNames_outOfMemory() void;

/// invoked if 'getStateNames' succeeds
/// Arguments:
/// - numStates is the length for the 'nodeIndices', 'stateNamePtrs' and 'stateNameLengths' arrays.
/// - nodeIndices contains the index of the state node
/// - stateNamePtrs contains the start of the state name
/// - stateNameLengths contains the length of the state name
extern fn getStateNames_success(numStates: u32, nodeIndices: [*]const u32, stateNamePtrs: [*]const u32, stateNameLengths: [*]const u32) void;

/// This resolves the state names and corresponding node indices.
/// This is needed to obtain state names from evaluation results.
///
/// Memory allocated for this function is never reused and can safely be discarded after the call returns
export fn getStateNames(modelPtr: *const std.ArrayList(LangTreeNode), bufferPtr: [*]u8, bufferLen: usize) void {
    const buffer: []u8 = bufferPtr[0..bufferLen];
    var fba = std.heap.FixedBufferAllocator.init(buffer);
    const alloc = fba.allocator();

    if (storeNodeStrings(modelPtr, alloc, getStateName)) |result| {
        getStateNames_success(result[0].items.len, result[0].items.ptr, result[1].items.ptr, result[2].items.ptr);
    } else |_| {
        getStateNames_outOfMemory();
    }
}

fn getStateName(node: *const LangTreeNode) ?[]const u8 {
    return switch (node.node.*) {
        .State => |state| state.stateName,
        else => null,
    };
}

fn storeNodeStrings(modelPtr: *const std.ArrayList(LangTreeNode), alloc: std.mem.Allocator, strFn: *const fn (*const LangTreeNode) ?[]const u8) !*const [3]std.ArrayList(u32) {
    var idxList = try alloc.alloc(std.ArrayList(u32), 3);
    idxList[0] = std.ArrayList(u32).init(alloc);
    idxList[1] = std.ArrayList(u32).init(alloc);
    idxList[2] = std.ArrayList(u32).init(alloc);

    try _storeNodeStrings(modelPtr, idxList[0..3], strFn);

    std.debug.assert(idxList[0].items.len == idxList[1].items.len);
    std.debug.assert(idxList[0].items.len == idxList[2].items.len);

    return idxList[0..3];
}

fn _storeNodeStrings(layerNodes: *const std.ArrayList(LangTreeNode), result: *[3]std.ArrayList(u32), strFn: *const fn (*const LangTreeNode) ?[]const u8) !void {
    for (layerNodes.items) |*node| {
        if (strFn(node)) |str| {
            try result[0].append(node.nodeIdx);
            try result[1].append(@intFromPtr(str.ptr));
            try result[2].append(str.len);
        }

        try _storeNodeStrings(node.transitions, result, strFn);
    }
}

// ==========
// Evaluation

extern fn evaluate_outOfMemory() void;

const ApiLangTag = packed struct {
    layerIdx: u32,
    nodeIdx: u32,
    index: u32,
    len: u32,
};

const ApiMatchFailure = packed struct {
    failureTypePtr: u32,
    failureTypeLen: u32,
    messagePtr: u32,
    messageLen: u32,
    tagStackPtr: u32,
    tagStackLen: u32,
    stateStackPtr: u32,
    stateStackLen: u32,
    committedInputPtr: u32,
    committedInputLen: u32,
};

/// invoked if 'evaluate' produces any match result
/// Arguments:
/// - matchLen: the number of input characters that were matched
/// - tagsPtr: a pointer to the applied tags
/// - tagsLen: the number of applied tags
/// - failure: a failure descriptor if the input did not match fully. '0' (nullptr) if there was no failure.
extern fn evaluate_success(matchLen: usize, tagsPtr: [*]const ApiLangTag, tagsLen: u32, failure: *allowzero const ApiMatchFailure) void;

export fn evaluate(modelPtr: *const std.ArrayList(LangTreeNode), rootStateIdx: usize, maxNoProgressTicks: usize, inputPtr: [*]const u8, inputLen: usize, bufferPtr: [*]u8, bufferLen: usize) void {
    const input: []const u8 = inputPtr[0..inputLen];
    const buffer: []u8 = bufferPtr[0..bufferLen];
    var fba = std.heap.FixedBufferAllocator.init(buffer);
    const alloc = fba.allocator();

    const evalResult: EvalAllResultFlat = Evaluator.evaluateAll(false, alloc, modelPtr, rootStateIdx, input, maxNoProgressTicks);
    if (evalResult.failure) |fail| {
        if (fail.failType == .OutOfMemory) {
            logger.err("Out of memory: {s}", .{fail.message});
            evaluate_outOfMemory();
            return;
        }
    }

    var apiTags = alloc.alloc(ApiLangTag, evalResult.matchTags.len) catch {
        logger.err("Out of memory: Unable to allocate result tags", .{});
        evaluate_outOfMemory();
        return;
    };

    for (evalResult.matchTags, 0..) |tag, i| {
        apiTags[i] = ApiLangTag{
            .layerIdx = tag.layerIdx,
            .nodeIdx = tag.nodeIdx(),
            .index = tag.index,
            .len = tag.len,
        };
    }

    var failure: *allowzero ApiMatchFailure = @ptrFromInt(0);
    if (evalResult.failure) |fail| {
        failure = allocateMatchFailure(alloc, fail) catch {
            logger.err("Out of memory: Unable to allocate failure info", .{});
            evaluate_outOfMemory();
            return;
        };
    }
    evaluate_success(evalResult.matchLen, apiTags.ptr, apiTags.len, failure);
}

fn allocateMatchFailure(alloc: std.mem.Allocator, fail: Evaluator.MatchFailure) !*ApiMatchFailure {
    var result = try alloc.alloc(ApiMatchFailure, 1);

    const failureName: [:0]const u8 = @tagName(fail.failType);
    const failureNameAlloc = try alloc.alloc(u8, failureName.len);
    std.mem.copyForwards(u8, failureNameAlloc, failureName);

    const messageAlloc = try alloc.alloc(u8, fail.message.len);
    std.mem.copyForwards(u8, messageAlloc, fail.message);

    const tagStack = try fail.tagStackNodeIndices(alloc);
    const stateStack = try fail.stateStackNodeIndices(alloc);

    const commitAlloc = try alloc.alloc(u8, fail.committedInput.len);
    std.mem.copyForwards(u8, commitAlloc, fail.committedInput);

    result[0] = ApiMatchFailure{
        .failureTypePtr = @intFromPtr(failureNameAlloc.ptr),
        .failureTypeLen = failureNameAlloc.len,
        .messagePtr = @intFromPtr(messageAlloc.ptr),
        .messageLen = messageAlloc.len,
        .tagStackPtr = @intFromPtr(tagStack.ptr),
        .tagStackLen = tagStack.len,
        .stateStackPtr = @intFromPtr(stateStack.ptr),
        .stateStackLen = stateStack.len,
        .committedInputPtr = @intFromPtr(commitAlloc.ptr),
        .committedInputLen = commitAlloc.len,
    };

    return &result[0];
}
