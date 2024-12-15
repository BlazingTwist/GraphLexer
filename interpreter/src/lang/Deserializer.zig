const std = @import("std");
const builtin = @import("builtin");

const lang_nodes = @import("Nodes.zig");
const NodeType = lang_nodes.NodeType;
const NodeMeta = lang_nodes.NodeMeta;
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

pub const DeserializeError = error{
    MissingNodeDelimiter,
    MissingAttributeDelimiter,
    InvalidBooleanValue,
    RootNodesMustBeStates,
    UnknownNodeType,
    OutOfMemory,
    Overflow,
    InvalidCharacter,
    InvalidRegex,
};

pub fn deserialize(allocator: std.mem.Allocator, data: []const u8) DeserializeError!*std.ArrayList(LangTreeNode) {
    var nodeLines = std.ArrayList([]const u8).init(allocator);
    defer nodeLines.deinit();
    var dataPos: usize = 0;
    while (dataPos < data.len) {
        const nextDelim = try findNextDelimiterIdx(data, '$', dataPos);
        try nodeLines.append(data[dataPos..nextDelim]);
        dataPos = nextDelim + 1;
    }
    std.debug.assert(dataPos == data.len);

    // identify state names
    var stateNameByStateIdx = std.ArrayList([]const u8).init(allocator);
    defer stateNameByStateIdx.deinit();
    for (nodeLines.items) |nodeLine| {
        if (nodeLine[0] == ' ') continue; // not a root node
        if (nodeLine[0] != @intFromEnum(NodeType.State)) return DeserializeError.RootNodesMustBeStates;

        try stateNameByStateIdx.append(nodeLine[4..]);
    }

    var nodeMetaList = std.ArrayList(NodeMeta).init(allocator);
    defer nodeMetaList.deinit();
    for (nodeLines.items, 0..) |nodeLine, i| {
        var nodeDepth: usize = 0;
        while (nodeLine[nodeDepth] == ' ') {
            nodeDepth += 1;
        }
        const nodeType: NodeType = @enumFromInt(nodeLine[nodeDepth]);
        const commit: bool = try toBoolean(nodeLine[nodeDepth + 2]);
        const attributeStr = nodeLine[(nodeDepth + 4)..];

        if (nodeLine[nodeDepth + 1] != ';') return DeserializeError.MissingAttributeDelimiter;
        if (nodeLine[nodeDepth + 3] != ';') return DeserializeError.MissingAttributeDelimiter;

        var allocNode = try allocator.alloc(LangNode, 1);
        allocNode[0] = switch (nodeType) {
            NodeType.ApplyTag => LangNode{ .ApplyTag = LangNode_ApplyTag{
                .tagName = attributeStr,
            } },
            NodeType.SubState => blk: {
                var split = std.mem.split(u8, attributeStr, ";");
                const attributes = [4][]const u8{
                    split.next() orelse return DeserializeError.MissingAttributeDelimiter,
                    split.next() orelse return DeserializeError.MissingAttributeDelimiter,
                    split.next() orelse return DeserializeError.MissingAttributeDelimiter,
                    split.next() orelse return DeserializeError.MissingAttributeDelimiter,
                };
                const stateIdx = try std.fmt.parseInt(usize, attributes[0], 10);
                break :blk LangNode{ .SubState = LangNode_SubState{
                    .stateName = stateNameByStateIdx.items[stateIdx],
                    .stateIdx = stateIdx,
                    .greedy = try toBoolean(attributes[1][0]),
                    .minRepeat = try std.fmt.parseInt(u32, attributes[2], 10),
                    .maxRepeat = try parseOptionalInt(u32, attributes[3]),
                } };
            },
            NodeType.State => LangNode{ .State = LangNode_State{
                .stateName = attributeStr,
            } },
            NodeType.MatchUnicode => blk: {
                var split = std.mem.split(u8, attributeStr, ";");
                const attributes = [2][]const u8{
                    split.next() orelse return DeserializeError.MissingAttributeDelimiter,
                    split.next() orelse return DeserializeError.MissingAttributeDelimiter,
                };
                break :blk LangNode{ .MatchUnicode = LangNode_MatchUnicode{
                    .minCodeInclusive = try parseOptionalInt(u8, attributes[0]),
                    .maxCodeInclusive = try parseOptionalInt(u8, attributes[1]),
                } };
            },
            NodeType.MatchLiteral => LangNode{ .MatchLiteral = LangNode_MatchLiteral{
                .literal = attributeStr,
            } },
            NodeType.MatchRegex => blk: {
                // ensure that the regex starts with '^'
                var regexStr = attributeStr;
                if (regexStr[0] != '^') {
                    var prefixedStr = try allocator.alloc(u8, regexStr.len + 1);
                    std.mem.copyForwards(u8, prefixedStr[1..], regexStr);
                    prefixedStr[0] = '^';
                    regexStr = prefixedStr;
                }

                if (mvzr.compile(regexStr)) |regex| {
                    break :blk LangNode{ .MatchRegex = LangNode_MatchRegex{
                        .regex = regex,
                        .regexStr = regexStr,
                    } };
                } else {
                    if (builtin.os.tag != .freestanding) {
                        std.debug.print("Unable to compile RegEx '{s}'", .{regexStr});
                    }
                    return DeserializeError.InvalidRegex;
                }
            },
        };

        try nodeMetaList.append(NodeMeta{
            .depth = nodeDepth,
            .commit = commit,
            .nodeIdx = i,
            .node = &allocNode[0],
        });
    }

    var allocResult = try allocator.alloc(std.ArrayList(LangTreeNode), 1);
    allocResult[0] = std.ArrayList(LangTreeNode).init(allocator);
    for (nodeMetaList.items, 0..) |nodeMeta, i| {
        if (nodeMeta.depth != 0) continue;

        try allocResult[0].append(LangTreeNode{
            .commit = nodeMeta.commit,
            .nodeIdx = nodeMeta.nodeIdx,
            .node = nodeMeta.node,
            .transitions = try resolveTransitions(allocator, &nodeMetaList, i),
        });
    }
    return &allocResult[0];
}

fn resolveTransitions(allocator: std.mem.Allocator, nodeMetaList: *std.ArrayList(NodeMeta), parentIdx: usize) DeserializeError!*std.ArrayList(LangTreeNode) {
    var allocList = try allocator.alloc(std.ArrayList(LangTreeNode), 1);
    allocList[0] = std.ArrayList(LangTreeNode).init(allocator);

    const childDepth = nodeMetaList.items[parentIdx].depth + 1;
    for ((parentIdx + 1)..nodeMetaList.items.len) |i| {
        const nodeMeta = nodeMetaList.items[i];
        if (nodeMeta.depth < childDepth) break; // left the child list, stop.
        if (nodeMeta.depth > childDepth) continue;

        try allocList[0].append(LangTreeNode{
            .commit = nodeMeta.commit,
            .nodeIdx = nodeMeta.nodeIdx,
            .node = nodeMeta.node,
            .transitions = try resolveTransitions(allocator, nodeMetaList, i),
        });
    }

    return &allocList[0];
}

fn findNextDelimiterIdx(data: []const u8, delimiter: u8, startPos: usize) DeserializeError!usize {
    var curPos: usize = startPos;
    while (curPos < data.len) {
        if (data[curPos] != delimiter) {
            curPos += 1;
            continue;
        }
        if (curPos + 1 >= data.len) {
            return curPos; // delimiter is isolated by end of string
        }
        if (data[curPos + 1] != delimiter) {
            return curPos; // delimiter is isolated by non-delimiter character
        }
        curPos += 2; // doubled up delimiters are ignored
    }
    return DeserializeError.MissingNodeDelimiter;
}

fn toBoolean(boolChar: u8) DeserializeError!bool {
    return switch (boolChar) {
        '0' => false,
        '1' => true,
        else => DeserializeError.InvalidBooleanValue,
    };
}

fn parseOptionalInt(comptime T: type, text: []const u8) DeserializeError!?T {
    if (text[0] == '-') {
        return null;
    }
    return try std.fmt.parseInt(T, text, 10);
}
