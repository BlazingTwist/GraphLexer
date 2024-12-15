const std = @import("std");

const Deserializer = @import("../lang/Deserializer.zig");

const Evaluator = @import("../lang/Evaluator.zig");
const EvalAllResult = Evaluator.EvalAllResult;
const LangTagTree = Evaluator.LangTagTree;
const LangTag = Evaluator.LangTag;

const NS_NODES = @import("../lang/Nodes.zig");
const LangTreeNode = NS_NODES.LangTreeNode;
const NodeType = NS_NODES.NodeType;

const langDefSerialized = "2;0;StringContent$ 0;0;StringContent$  5;1;[^\"]*$2;0;Token$ 0;0;String$  4;1;\"$   1;1;0;0;1;1$    4;1;\"$ 0;0;Integer$  5;1;[0-9]+$ 0;0;SymbolHigh$  3;1;76;-1$ 0;0;SymbolLow$  3;1;-1;75$";
const testInput = "\"str\"42AKLZ";

test "basic language definition with tags, subStates, unicode, literal and regex" {
    var langDefArena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer langDefArena.deinit();

    const langDef = try Deserializer.deserialize(langDefArena.allocator(), langDefSerialized);

    const testTagsAsTree = [_]bool{ false, true };
    inline for (testTagsAsTree) |tagsAsTree| {
        var evalArena = std.heap.ArenaAllocator.init(std.testing.allocator);
        defer evalArena.deinit();

        const allRes = Evaluator.evaluateAll(tagsAsTree, evalArena.allocator(), langDef, 1, testInput, null);
        checkExpectations(tagsAsTree, &allRes) catch |ex| {
            _print_test_result(tagsAsTree, &allRes);
            return ex;
        };
    }
}

fn checkExpectations(comptime tagsAsTree: bool, allRes: *const EvalAllResult(tagsAsTree)) !void {
    try std.testing.expectEqual(null, allRes.failure);
    try std.testing.expectEqual(11, allRes.matchLen);

    if (tagsAsTree) {
        try std.testing.expectEqual(6, allRes.matchTags.len);

        const rootTags: []LangTagTree = allRes.matchTags;
        try expectTagTree(rootTags[0], "String", "\"str\"", 1);
        try expectTagTree(rootTags[0].subTags[0], "StringContent", "str", 0);
        try expectTagTree(rootTags[1], "Integer", "42", 0);
        try expectTagTree(rootTags[2], "SymbolLow", "A", 0);
        try expectTagTree(rootTags[3], "SymbolLow", "K", 0);
        try expectTagTree(rootTags[4], "SymbolHigh", "L", 0);
        try expectTagTree(rootTags[5], "SymbolHigh", "Z", 0);
    } else {
        try std.testing.expectEqual(7, allRes.matchTags.len);

        const rootTags: []LangTag = allRes.matchTags;
        const maxU32 = std.math.maxInt(u32);
        try expectTag(rootTags[0], "StringContent", "str", rootTags[1].layerIdx - 1);
        try expectTag(rootTags[1], "String", "\"str\"", maxU32);
        try expectTag(rootTags[2], "Integer", "42", maxU32);
        try expectTag(rootTags[3], "SymbolLow", "A", maxU32);
        try expectTag(rootTags[4], "SymbolLow", "K", maxU32);
        try expectTag(rootTags[5], "SymbolHigh", "L", maxU32);
        try expectTag(rootTags[6], "SymbolHigh", "Z", maxU32);
    }
}

fn expectTagTree(tag: LangTagTree, expTagName: []const u8, expStr: []const u8, numSubTags: usize) !void {
    try std.testing.expectEqualStrings(expTagName, tag.name());

    const tagStr = testInput[tag.index..(tag.index + tag.len)];
    try std.testing.expectEqualStrings(expStr, tagStr);

    try std.testing.expectEqual(numSubTags, tag.subTags.len);
}

fn expectTag(tag: LangTag, expTagName: []const u8, expStr: []const u8, maxLayerIdx: u32) !void {
    try std.testing.expectEqualStrings(expTagName, tag.name());

    const tagStr = testInput[tag.index..(tag.index + tag.len)];
    try std.testing.expectEqualStrings(expStr, tagStr);

    try std.testing.expect(tag.layerIdx <= maxLayerIdx);
}

fn _print_test_result(comptime tagsAsTree: bool, allRes: *const EvalAllResult(tagsAsTree)) void {
    std.debug.print("match length: {}\n", .{allRes.matchLen});
    for (allRes.matchTags) |rootTag| {
        _print_tag(tagsAsTree, rootTag, 0);
    }

    if (allRes.failure) |f| {
        std.debug.print(
            "no match, failType: {s} | message: {s} | committed: {s}\n",
            .{ @tagName(f.failType), f.message, f.committedInput },
        );
    }

    if (allRes.matchLen < testInput.len) {
        std.debug.print("unmatched input: '{s}'\n", .{testInput[allRes.matchLen..]});
    }
}

fn _print_tag(comptime tagsAsTree: bool, tag: if (tagsAsTree) LangTagTree else LangTag, depth: usize) void {
    var indent = std.testing.allocator.alloc(u8, depth) catch unreachable;
    for (0..depth) |i| {
        indent[i] = ' ';
    }
    defer std.testing.allocator.free(indent);

    std.debug.print("{s} tag={s} | '{s}'\n", .{ indent, tag.name(), testInput[tag.index..(tag.index + tag.len)] });

    if (tagsAsTree) {
        for (tag.subTags) |subTag| {
            _print_tag(tagsAsTree, subTag, depth + 1);
        }
    }
}
