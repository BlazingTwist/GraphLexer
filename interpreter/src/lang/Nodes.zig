const std = @import("std");
const mvzr = @import("../lib/mvzr/src/mvzr.zig");
const Regex = mvzr.Regex;

pub const NodeType = enum(u8) {
    ApplyTag = '0',
    SubState = '1',
    State = '2',
    MatchUnicode = '3',
    MatchLiteral = '4',
    MatchRegex = '5',
};

pub const LangNode_ApplyTag = struct { tagName: []const u8 };
pub const LangNode_SubState = struct { stateName: []const u8, stateIdx: usize, greedy: bool, minRepeat: u32, maxRepeat: ?u32 };
pub const LangNode_State = struct { stateName: []const u8 };
pub const LangNode_MatchUnicode = struct { minCodeInclusive: ?u8, maxCodeInclusive: ?u8 };
pub const LangNode_MatchLiteral = struct { literal: []const u8 };
pub const LangNode_MatchRegex = struct { regex: Regex, regexStr: []const u8 };

pub const LangNode = union(NodeType) {
    ApplyTag: LangNode_ApplyTag,
    SubState: LangNode_SubState,
    State: LangNode_State,
    MatchUnicode: LangNode_MatchUnicode,
    MatchLiteral: LangNode_MatchLiteral,
    MatchRegex: LangNode_MatchRegex,

    pub fn contentText(self: LangNode, allocator: std.mem.Allocator) []const u8 {
        return switch (self) {
            .ApplyTag => |x| x.tagName,
            .SubState => |x| blk: {
                var repSymbol: []const u8 = undefined;
                if (x.minRepeat == 1 and x.maxRepeat == 1) {
                    repSymbol = "";
                } else if (x.minRepeat == 0 and x.maxRepeat == 1) {
                    repSymbol = "?";
                } else if (x.minRepeat == 0 and x.maxRepeat == null) {
                    repSymbol = "*";
                } else if (x.minRepeat == 1 and x.maxRepeat == null) {
                    repSymbol = "+";
                } else {
                    repSymbol = std.fmt.allocPrint(allocator, "{{{},{}}}", .{ x.minRepeat, x.maxRepeat.? }) catch "<ERROR>";
                }

                break :blk std.fmt.allocPrint(
                    allocator,
                    "{s} {s}{s}",
                    .{ x.stateName, repSymbol, (if (x.minRepeat != x.maxRepeat and !x.greedy) "?" else "") },
                ) catch "<ERROR>";
            },
            .State => |x| x.stateName,
            .MatchUnicode => |x| blk: {
                break :blk std.fmt.allocPrint(
                    allocator,
                    "{s}charCode{s}",
                    .{
                        if (x.minCodeInclusive != null) (std.fmt.allocPrint(allocator, "{} <= ", .{x.minCodeInclusive.?}) catch "<ERROR>") else "",
                        if (x.maxCodeInclusive != null) (std.fmt.allocPrint(allocator, " <= {}", .{x.maxCodeInclusive.?}) catch "<ERROR>") else "",
                    },
                ) catch "<ERROR>";
            },
            .MatchLiteral => |x| x.literal,
            .MatchRegex => |x| x.regexStr,
        };
    }
};

pub const NodeMeta = struct {
    depth: usize,
    commit: bool,
    nodeIdx: usize, // a index that can be used to refer to the node. Useful to reduce bandwidth for returning evaluation results
    node: *LangNode,
};

pub const LangTreeNode = struct {
    commit: bool,
    nodeIdx: usize, // a index that can be used to refer to the node. Useful to reduce bandwidth for returning evaluation results
    node: *LangNode,
    transitions: *std.ArrayList(LangTreeNode),
};
