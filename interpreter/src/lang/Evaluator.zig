const std = @import("std");

const lang_nodes = @import("Nodes.zig");
const NodeType = lang_nodes.NodeType;
const LangNode_ApplyTag = lang_nodes.LangNode_ApplyTag;
const LangNode_SubState = lang_nodes.LangNode_SubState;
const LangNode_State = lang_nodes.LangNode_State;
const LangNode_MatchUnicode = lang_nodes.LangNode_MatchUnicode;
const LangNode_MatchLiteral = lang_nodes.LangNode_MatchLiteral;
const LangNode_MatchRegex = lang_nodes.LangNode_MatchRegex;
const LangNode = lang_nodes.LangNode;
const LangTreeNode = lang_nodes.LangTreeNode;

const mvzr = @import("../lib/mvzr/src/mvzr.zig");
const Regex = mvzr.Regex;

pub const LangTag = struct {
    const Self = @This();

    layerIdx: u32,
    node: *const LangTreeNode,
    index: usize,
    len: usize,

    pub fn nodeIdx(self: *const Self) usize {
        return self.node.nodeIdx;
    }

    pub fn name(self: *const Self) []const u8 {
        return self.node.node.ApplyTag.tagName;
    }
};

pub const LangTagTree = struct {
    const Self = @This();

    node: *const LangTreeNode,
    index: usize,
    len: usize,
    subTags: []LangTagTree,

    pub fn nodeIdx(self: *const Self) usize {
        return self.node.nodeIdx;
    }

    pub fn name(self: *const Self) []const u8 {
        return self.node.node.ApplyTag.tagName;
    }
};

pub const FailureType = enum {
    InfiniteLoop,
    OutOfMemory,
    NoMatch,
};

pub const MatchFailure = struct {
    const Self = @This();

    failType: FailureType,
    message: []const u8,
    tagStack: ?*std.ArrayList(*const LangTreeNode),
    stateStack: ?*std.ArrayList(*const LangTreeNode),
    committedInput: []const u8,

    pub fn tagStackNames(self: *const Self, alloc: std.mem.Allocator) ![][]const u8 {
        const len = if (self.tagStack) |stack| stack.items.len else 0;
        var result = try alloc.alloc([]const u8, len);
        if (self.tagStack) |stack| {
            for (stack.items, 0..) |tag, i| {
                result[i] = tag.node.ApplyTag.tagName;
            }
        }
        return result;
    }

    pub fn tagStackNodeIndices(self: *const Self, alloc: std.mem.Allocator) ![]const usize {
        return try nodeListToNodeIndices(alloc, self.tagStack);
    }

    pub fn stateStackNames(self: *const Self, alloc: std.mem.Allocator) ![][]const u8 {
        const len = if (self.stateStack) |stack| stack.items.len else 0;
        var result = try alloc.alloc([]const u8, len);
        if (self.stateStack) |stack| {
            for (stack.items, 0..) |state, i| {
                result[i] = state.node.State.stateName;
            }
        }
        return result;
    }

    pub fn stateStackNodeIndices(self: *const Self, alloc: std.mem.Allocator) ![]const usize {
        return try nodeListToNodeIndices(alloc, self.stateStack);
    }

    fn nodeListToNodeIndices(alloc: std.mem.Allocator, list: ?*std.ArrayList(*const LangTreeNode)) ![]const usize {
        const len = if (list) |stack| stack.items.len else 0;
        var result: []usize = try alloc.alloc(usize, len);
        if (list) |stack| {
            for (stack.items, 0..) |node, i| {
                result[i] = node.nodeIdx;
            }
        }
        return result;
    }
};

const MatchSuccess = struct {
    len: usize,
    tags: []LangTag,
};

const EvalResultType = enum {
    success,
    failure,
};

const EvalResult = union(EvalResultType) {
    success: MatchSuccess,
    failure: MatchFailure,
};

pub const EvalAllResultFlat = struct {
    matchLen: usize,
    matchTags: []LangTag,
    failure: ?MatchFailure,
};

pub const EvalAllResultTree = struct {
    matchLen: usize,
    matchTags: []LangTagTree,
    failure: ?MatchFailure,
};

pub fn EvalAllResult(comptime tagsAsTree: bool) type {
    if (tagsAsTree) {
        return EvalAllResultTree;
    } else {
        return EvalAllResultFlat;
    }
}

pub fn evaluateAll(
    comptime tagsAsTree: bool,
    alloc: std.mem.Allocator,
    states: *const std.ArrayList(LangTreeNode),
    rootState: usize,
    input: []const u8,
    maxNoProgressTicks: ?usize,
) EvalAllResult(tagsAsTree) {
    const ResultType: type = EvalAllResult(tagsAsTree);
    const TagType: type = comptime if (tagsAsTree) LangTagTree else LangTag;

    const tagPool: []LangTag = alloc.alloc(LangTag, 128) catch {
        const failure = MatchFailure{
            .failType = FailureType.OutOfMemory,
            .message = "Failed to allocate tag-pool for evaluateAll()",
            .tagStack = null,
            .stateStack = null,
            .committedInput = "",
        };
        return ResultType{ .failure = failure, .matchLen = 0, .matchTags = &[_]TagType{} };
    };

    var eval = Evaluator{
        .allocator = alloc,
        .states = states,
        .input = input,
        .maxNoProgressTicks = maxNoProgressTicks orelse 1000,
        .tagPool = tagPool,
    };

    const rootLangNode: *const LangTreeNode = &eval.states.items[rootState];
    var posOffset: usize = 0;
    var rootTags: std.ArrayList(LangTagTree) = undefined;
    if (tagsAsTree) {
        rootTags = std.ArrayList(LangTagTree).initCapacity(alloc, 128) catch {
            const failRes = eval.outOfMemoryFailure("Failed to allocate root-tags list for evaluateAll()", "");
            return ResultType{ .failure = failRes.failure, .matchLen = 0, .matchTags = &[_]TagType{} };
        };
    }

    while (posOffset < input.len) {
        var prevTagPoolEnd: usize = undefined;
        if (tagsAsTree) {
            eval.tagPoolEnd = 0; // reset tag pool since it's cleared into 'rootTags' after each eval
        } else {
            prevTagPoolEnd = eval.tagPoolEnd;
        }

        const subResult = eval.evalRootNode(!tagsAsTree, posOffset, rootLangNode);

        if (subResult) |subRes| {
            switch (subRes.*) {
                .success => |s| {
                    if (tagsAsTree) {
                        // consume the tagPool into a tree structure
                        const numNewRoots = countRootNodes(s.tags);
                        rootTags.ensureTotalCapacity(rootTags.items.len + numNewRoots) catch {
                            const failRes = eval.outOfMemoryFailure("Failed to allocate root-tags list for evaluateAll()", "");
                            return ResultType{ .failure = failRes.failure, .matchLen = 0, .matchTags = &[_]TagType{} };
                        };
                        reconstructTagTree(alloc, s.tags, rootTags.allocatedSlice()[rootTags.items.len..]) catch {
                            const failRes = eval.outOfMemoryFailure("Failed to append root-tag for evaluateAll()", "");
                            return ResultType{ .failure = failRes.failure, .matchLen = 0, .matchTags = &[_]TagType{} };
                        };
                        rootTags.items.len += numNewRoots;
                    } else {
                        const rootTagLayer = eval.tagPool[eval.tagPoolEnd - 1].layerIdx;
                        for (eval.tagPool[prevTagPoolEnd..eval.tagPoolEnd]) |*tag| {
                            if (tag.layerIdx == rootTagLayer) {
                                tag.layerIdx = std.math.maxInt(u32); // pull root layers to the top because different 'evalRootNode' calls will have different heights.
                            }
                        }
                    }
                    posOffset += s.len;
                },
                .failure => |f| {
                    if (tagsAsTree) {
                        return EvalAllResult(true){
                            .matchLen = posOffset,
                            .matchTags = rootTags.items,
                            .failure = f,
                        };
                    } else {
                        return EvalAllResult(false){
                            .matchLen = posOffset,
                            .matchTags = eval.tagPool[0..prevTagPoolEnd], // discard tags that were applied during the failed match
                            .failure = f,
                        };
                    }
                },
            }
        } else {
            break;
        }
    }

    if (tagsAsTree) {
        return EvalAllResult(true){
            .matchLen = posOffset,
            .matchTags = rootTags.items,
            .failure = null,
        };
    } else {
        return EvalAllResult(false){
            .matchLen = posOffset,
            .matchTags = eval.tagPool[0..eval.tagPoolEnd],
            .failure = null,
        };
    }
}

fn countTags(nodes: []LangTagTree) usize {
    var result: usize = nodes.len;
    for (nodes) |node| {
        result += countTags(node.subTags);
    }
    return result;
}

/// The Tag tree has been flattened into a 1D-Slice and 'layerIdx' fields to minimize garbage-allocations during evaluation.
/// This drastically reduces the allocated memory which was caused by backtracking from substates whose transitions rejected.
///
/// In testing this reduced allocated memory from 11 MB to 1.7 MB on an input of 63149 characters
fn reconstructTagTree(alloc: std.mem.Allocator, tagsFlat: []LangTag, target: []LangTagTree) !void {
    if (tagsFlat.len <= 0) {
        return;
    }

    const rootLayer = tagsFlat[tagsFlat.len - 1].layerIdx;
    var childStartIdx: usize = 0;
    var rootNodeIdx: usize = 0;
    for (tagsFlat, 0..) |tagFlat, i| {
        if (tagFlat.layerIdx == rootLayer) {
            const numChildren = countRootNodes(tagsFlat[childStartIdx..i]);

            const childAl = try alloc.alloc(LangTagTree, numChildren);
            try reconstructTagTree(alloc, tagsFlat[childStartIdx..i], childAl);

            target[rootNodeIdx] = LangTagTree{
                .node = tagFlat.node,
                .index = tagFlat.index,
                .len = tagFlat.len,
                .subTags = childAl,
            };

            rootNodeIdx += 1;
            childStartIdx = i + 1;
        }
    }
}

/// Utility for 'reconstructTagTree'
/// Counting the amount of nodes allows us to use slices instead of ArrayLists which minimizes memory allocations even further.
///
/// In testing this reduced allocated memory from 1.7 MB to 0.65 MB on an input of 63149 characters
fn countRootNodes(tagsFlat: []LangTag) usize {
    if (tagsFlat.len <= 0) {
        return 0;
    }

    const rootLayer = tagsFlat[tagsFlat.len - 1].layerIdx;
    var count: usize = 0;
    for (tagsFlat) |tagFlat| {
        if (tagFlat.layerIdx == rootLayer) {
            count += 1;
        }
    }
    return count;
}

const Evaluator = struct {
    const Self = @This();

    allocator: std.mem.Allocator,
    states: *const std.ArrayList(LangTreeNode),
    input: []const u8,
    maxNoProgressTicks: usize,

    tagPool: []LangTag,
    tagPoolEnd: usize = 0,

    noProgressTicks: usize = 0,
    rootMatchOffset: usize = 0,

    evalResult: EvalResult = undefined, // hold memory slot for EvalResult so allocation cannot fail during evaluation.

    fn evalRootNode(self: *Self, comptime alwaysResize: bool, pos: usize, node: *const LangTreeNode) ?*EvalResult {
        self.noProgressTicks = 0;
        self.rootMatchOffset = pos;
        return nodeMatches(self, alwaysResize, pos, node);
    }

    fn nodeMatches(self: *Self, comptime alwaysResize: bool, pos: usize, node: *const LangTreeNode) ?*EvalResult {
        self.noProgressTicks += 1;
        if (self.noProgressTicks > self.maxNoProgressTicks) {
            return self.infiniteLoopFailure();
        }

        switch (node.node.*) {
            .ApplyTag => {
                const tagStartIdx = self.tagPoolEnd;

                const tRes = self.transitionsMatch(alwaysResize, pos, node);
                if (tRes == null and node.commit) {
                    const failRes = self.initMatchFailure(node, self.input[self.rootMatchOffset..pos]);
                    const fail = failRes.failure;
                    if (fail.tagStack) |tagStack| {
                        tagStack.insert(0, node) catch {
                            return self.outOfMemoryFailure("Failed to update the tagStack of a match failure.", fail.committedInput);
                        };
                    }
                    return failRes;
                }

                if (tRes) |result| {
                    if (result.* == .failure) return result;

                    // grow tag pool if needed
                    if (self.tagPoolEnd >= self.tagPool.len) {
                        const old_len = self.tagPool.len;
                        const new_len = old_len + (old_len / 2);
                        if (alwaysResize) {
                            if (self.allocator.resize(self.tagPool, new_len)) {
                                self.tagPool.len = new_len;
                            } else {
                                return self.outOfMemoryFailure("Failed to resize tag-pool.", "");
                            }
                        } else {
                            const newTagPool = self.allocator.alloc(LangTag, new_len) catch {
                                return self.outOfMemoryFailure("Failed to wrap applied tag around the transition tags", "");
                            };
                            std.mem.copyForwards(LangTag, newTagPool, self.tagPool);
                            self.tagPool = newTagPool;
                        }
                    }

                    // construct wrapper tag
                    self.tagPool[self.tagPoolEnd] = LangTag{
                        .layerIdx = if (self.tagPoolEnd > tagStartIdx) (self.tagPool[self.tagPoolEnd - 1].layerIdx + 1) else 0,
                        .node = node,
                        .index = pos,
                        .len = result.success.len,
                    };
                    self.tagPoolEnd += 1;

                    result.success.tags = self.tagPool[tagStartIdx..self.tagPoolEnd];
                }
                return tRes;
            },
            .SubState => |lNode| {
                const stateNode: *const LangTreeNode = &self.states.items[lNode.stateIdx];
                const minMatches = lNode.minRepeat;
                const maxMatches = lNode.maxRepeat;
                var numMatches: usize = 0;
                var matchLen: usize = 0;
                const tagStartIdx = self.tagPoolEnd;
                var maxTagLayer: u32 = 0;
                while (true) {
                    if ((numMatches >= minMatches and !lNode.greedy) or (maxMatches != null and numMatches >= maxMatches.?)) {
                        const tRes = self.transitionsMatch(alwaysResize, pos + matchLen, node);
                        if (tRes) |result| {
                            if (result.* == .failure) return result;

                            if (result.success.tags.len > 0) {
                                const topTag = result.success.tags[result.success.tags.len - 1];
                                const topTagLayer = topTag.layerIdx;
                                if (topTagLayer > maxTagLayer) {
                                    // if the result has a taller tree than the previous matches, move the root nodes of the previous matches to the new top level
                                    const tagEndIdx = self.tagPoolEnd - result.success.tags.len;
                                    for (tagStartIdx..tagEndIdx) |ti| {
                                        if (self.tagPool[ti].layerIdx == maxTagLayer) { // is root node
                                            self.tagPool[ti].layerIdx = topTagLayer;
                                        }
                                    }
                                    maxTagLayer = topTagLayer;
                                } else if (topTagLayer < maxTagLayer) {
                                    // if the result is not as tall as the previous matches, move the results root nodes to the existing top level
                                    for (result.success.tags) |*rTag| {
                                        if (rTag.layerIdx == topTagLayer) {
                                            rTag.layerIdx = maxTagLayer;
                                        }
                                    }
                                }
                            }

                            result.success.len += matchLen;
                            result.success.tags = self.tagPool[tagStartIdx..self.tagPoolEnd];
                            return result;
                        }
                        // ignore case when transitions do not accept, first try matching the subState again.
                    }

                    if (maxMatches != null and numMatches >= maxMatches.?) {
                        if (numMatches >= minMatches and node.commit) {
                            return self.initMatchFailure(node, self.input[self.rootMatchOffset..(pos + matchLen)]);
                        }

                        return null;
                    }

                    // either not enough matches, or is greedy, or none of the transitions matched.
                    const stateRes = self.nodeMatches(alwaysResize, pos + matchLen, stateNode);
                    if (stateRes) |result| {
                        if (result.* == .failure) return result;

                        if (result.success.len > 0) {
                            self.noProgressTicks = 0;
                        } else {
                            self.noProgressTicks += 1;
                            if (self.noProgressTicks > self.maxNoProgressTicks) {
                                return self.infiniteLoopFailure();
                            }
                        }
                        numMatches += 1;
                        matchLen += result.success.len;

                        // balance tag tree heights
                        if (result.success.tags.len > 0) {
                            const topTag = result.success.tags[result.success.tags.len - 1];
                            const topTagLayer = topTag.layerIdx;
                            if (topTagLayer > maxTagLayer) {
                                // if the result has a taller tree than the previous matches, move the root nodes of the previous matches to the new top level
                                const tagEndIdx = self.tagPoolEnd - result.success.tags.len;
                                for (tagStartIdx..tagEndIdx) |ti| {
                                    if (self.tagPool[ti].layerIdx == maxTagLayer) { // is root node
                                        self.tagPool[ti].layerIdx = topTagLayer;
                                    }
                                }
                                maxTagLayer = topTagLayer;
                            } else if (topTagLayer < maxTagLayer) {
                                // if the result is not as tall as the previous matches, move the results root nodes to the existing top level
                                for (result.success.tags) |*rTag| {
                                    if (rTag.layerIdx == topTagLayer) {
                                        rTag.layerIdx = maxTagLayer;
                                    }
                                }
                            }
                        }
                        continue;
                    }

                    if (numMatches < minMatches) {
                        if (numMatches > 0 and node.commit) {
                            return self.initMatchFailure(node, self.input[self.rootMatchOffset..(pos + matchLen)]);
                        }
                        return null;
                    }

                    // found enough matches to move on
                    // either:  is greedy -> check transitions
                    // or:     not greedy, transitions have rejected
                    if (!lNode.greedy) {
                        if (node.commit) {
                            return self.initMatchFailure(node, self.input[self.rootMatchOffset..(pos + matchLen)]);
                        }
                        return null;
                    }

                    const tRes = self.transitionsMatch(alwaysResize, pos + matchLen, node);
                    if (tRes) |result| {
                        if (result.* == .failure) return result;

                        result.success.len += matchLen;

                        // balance tag tree heights
                        if (result.success.tags.len > 0) {
                            const topTag = result.success.tags[result.success.tags.len - 1];
                            const topTagLayer = topTag.layerIdx;
                            if (topTagLayer > maxTagLayer) {
                                // if the result has a taller tree than the previous matches, move the root nodes of the previous matches to the new top level
                                const tagEndIdx = self.tagPoolEnd - result.success.tags.len;
                                for (tagStartIdx..tagEndIdx) |ti| {
                                    if (self.tagPool[ti].layerIdx == maxTagLayer) { // is root node
                                        self.tagPool[ti].layerIdx = topTagLayer;
                                    }
                                }
                                maxTagLayer = topTagLayer;
                            } else if (topTagLayer < maxTagLayer) {
                                // if the result is not as tall as the previous matches, move the results root nodes to the existing top level
                                for (result.success.tags) |*rTag| {
                                    if (rTag.layerIdx == topTagLayer) {
                                        rTag.layerIdx = maxTagLayer;
                                    }
                                }
                            }
                        }

                        result.success.tags = self.tagPool[tagStartIdx..self.tagPoolEnd];
                        return result;
                    } else {
                        if (node.commit) {
                            return self.initMatchFailure(node, self.input[self.rootMatchOffset..(pos + matchLen)]);
                        }
                        return null;
                    }
                }
            },
            .State => {
                return self.transitionsMatch(alwaysResize, pos, node);
            },
            .MatchUnicode => |lNode| {
                if (self.input.len < (pos + 1)) {
                    return null;
                }

                const c = self.input[pos];
                if (lNode.minCodeInclusive != null and c < lNode.minCodeInclusive.?) {
                    return null;
                }
                if (lNode.maxCodeInclusive != null and c > lNode.maxCodeInclusive.?) {
                    return null;
                }

                const tRes = self.transitionsMatch(alwaysResize, pos + 1, node);
                if (tRes) |result| {
                    if (result.* == .failure) return result;

                    self.noProgressTicks = 0;
                    result.success.len += 1;
                    return result;
                } else {
                    if (node.commit) {
                        return self.initMatchFailure(node, self.input[self.rootMatchOffset..(pos + 1)]);
                    }
                    return null;
                }
            },
            .MatchLiteral => |lNode| {
                const len = lNode.literal.len;
                if (self.input.len < (pos + len)) {
                    return null;
                }
                if (!std.mem.eql(u8, lNode.literal, self.input[pos..(pos + len)])) {
                    return null;
                }

                const tRes = self.transitionsMatch(alwaysResize, pos + len, node);
                if (tRes) |result| {
                    if (result.* == .failure) return result;

                    self.noProgressTicks = 0;
                    result.success.len += len;
                    return result;
                } else {
                    if (node.commit) {
                        return self.initMatchFailure(node, self.input[self.rootMatchOffset..(pos + len)]);
                    }
                    return null;
                }
            },
            .MatchRegex => |lNode| {
                var regex = lNode.regex;

                const match = regex.match(self.input[pos..]);
                if (match == null) {
                    return null;
                }

                const len: usize = match.?.slice.len;
                const tRes = self.transitionsMatch(alwaysResize, pos + len, node);
                if (tRes) |result| {
                    if (result.* == .failure) return result;

                    self.noProgressTicks = 0;
                    result.success.len += len;
                    return result;
                } else {
                    if (node.commit) {
                        return self.initMatchFailure(node, self.input[self.rootMatchOffset..(pos + len)]);
                    }
                    return null;
                }
            },
        }
    }

    fn transitionsMatch(self: *Self, comptime alwaysResize: bool, pos: usize, node: *const LangTreeNode) ?*EvalResult {
        if (node.transitions.items.len <= 0) {
            return self.initMatchSuccess();
        }

        for (node.transitions.items) |*transition| {
            const res = self.nodeMatches(alwaysResize, pos, transition);
            if (res) |result| {
                switch (result.*) {
                    .failure => |failureRes| {
                        switch (node.node.*) {
                            .ApplyTag => {
                                if (failureRes.tagStack) |tagStack| {
                                    tagStack.insert(0, node) catch {
                                        return self.outOfMemoryFailure("Failed to update the tagStack of a match failure.", failureRes.committedInput);
                                    };
                                }
                            },
                            .State => {
                                if (failureRes.stateStack) |stateStack| {
                                    stateStack.insert(0, node) catch {
                                        return self.outOfMemoryFailure("Failed to update the stateStack of a match failure.", failureRes.committedInput);
                                    };
                                }
                            },
                            else => {},
                        }
                    },
                    else => {},
                }
                return result;
            }
        }

        return null;
    }

    fn initMatchSuccess(self: *Self) *EvalResult {
        return self.makeResult(MatchSuccess{
            .len = 0,
            .tags = &[_]LangTag{},
        });
    }

    fn initMatchFailure(self: *Self, node: *const LangTreeNode, committedInput: []const u8) *EvalResult {
        const message = std.fmt.allocPrint(
            self.allocator,
            "None of the {} possible transitions of the '{s}' {s}-Node accepted the input.",
            .{
                node.transitions.items.len,
                node.node.contentText(self.allocator),
                @tagName(node.node.*),
            },
        ) catch {
            return self.outOfMemoryFailure("Failed to allocate info message for match-failure.", "");
        };
        var lists = self.allocator.alloc(std.ArrayList(*const LangTreeNode), 2) catch {
            return self.outOfMemoryFailure("Failed to allocate tag/state-stacks for match-failure.", "");
        };
        lists[0] = std.ArrayList(*const LangTreeNode).init(self.allocator);
        lists[1] = std.ArrayList(*const LangTreeNode).init(self.allocator);
        return self.makeResultF(MatchFailure{
            .failType = FailureType.NoMatch,
            .message = message,
            .tagStack = &lists[0],
            .stateStack = &lists[1],
            .committedInput = committedInput,
        });
    }

    fn infiniteLoopFailure(self: *Self) *EvalResult {
        var lists = self.allocator.alloc(std.ArrayList(*const LangTreeNode), 2) catch {
            return self.outOfMemoryFailure("Failed to allocate tag/state-stacks for infinite-loop failure.", "");
        };
        lists[0] = std.ArrayList(*const LangTreeNode).init(self.allocator);
        lists[1] = std.ArrayList(*const LangTreeNode).init(self.allocator);
        return self.makeResultF(MatchFailure{
            .failType = FailureType.InfiniteLoop,
            .message = "Exceeded maximum amount of ticks without progressing.",
            .tagStack = &lists[0],
            .stateStack = &lists[1],
            .committedInput = "",
        });
    }

    fn outOfMemoryFailure(self: *Self, comptime msg: []const u8, committed: ?[]const u8) *EvalResult {
        return self.makeResultF(MatchFailure{
            .failType = FailureType.OutOfMemory,
            .message = msg,
            .tagStack = null,
            .stateStack = null,
            .committedInput = committed orelse "",
        });
    }

    fn makeResult(self: *Self, success: MatchSuccess) *EvalResult {
        self.evalResult = EvalResult{ .success = success };
        return &self.evalResult;
    }

    fn makeResultF(self: *Self, failure: MatchFailure) *EvalResult {
        self.evalResult = EvalResult{ .failure = failure };
        return &self.evalResult;
    }
};
