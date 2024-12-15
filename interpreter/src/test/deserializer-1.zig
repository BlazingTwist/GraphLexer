const std = @import("std");
const Deserializer = @import("../lang/Deserializer.zig");
const LangTreeNode = @import("../lang/Nodes.zig").LangTreeNode;
const NodeType = @import("../lang/Nodes.zig").NodeType;

test "deserialization of all supported node-types is successful" {
    var langDefArena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer langDefArena.deinit();
    const alloc = langDefArena.allocator();

    const serialized = "2;0;State1$ 0;0;Tag1$ 0;1;Tag2$ 1;0;0;0;1;1$ 1;1;1;0;0;-1$ 1;1;2;1;1;2$ 3;0;-1;-1$ 3;1;12;233$ 4;0;lit1$ 4;1;lit2$ 5;0;pat1$ 5;1;^pat2$2;0;State2$2;0;State3$";
    const langDef = try Deserializer.deserialize(alloc, serialized);

    try std.testing.expectEqual(3, langDef.items.len); // check number of States
    try expectNode(alloc, langDef.items[0], .State, false, "State1", 11);
    try expectNode(alloc, langDef.items[1], .State, false, "State2", 0);
    try expectNode(alloc, langDef.items[2], .State, false, "State3", 0);

    const otherNodes = langDef.items[0].transitions.items;
    try expectNode(alloc, otherNodes[0], .ApplyTag, false, "Tag1", 0);
    try expectNode(alloc, otherNodes[1], .ApplyTag, true, "Tag2", 0);
    try expectNode(alloc, otherNodes[2], .SubState, false, "State1 ", 0);
    try expectNode(alloc, otherNodes[3], .SubState, true, "State2 *?", 0);
    try expectNode(alloc, otherNodes[4], .SubState, true, "State3 {1,2}", 0);
    try expectNode(alloc, otherNodes[5], .MatchUnicode, false, "charCode", 0);
    try expectNode(alloc, otherNodes[6], .MatchUnicode, true, "12 <= charCode <= 233", 0);
    try expectNode(alloc, otherNodes[7], .MatchLiteral, false, "lit1", 0);
    try expectNode(alloc, otherNodes[8], .MatchLiteral, true, "lit2", 0);
    try expectNode(alloc, otherNodes[9], .MatchRegex, false, "^pat1", 0);
    try expectNode(alloc, otherNodes[10], .MatchRegex, true, "^pat2", 0);
}

fn expectNode(alloc: std.mem.Allocator, node: LangTreeNode, expType: NodeType, expCommit: bool, expContentText: []const u8, expChildren: usize) !void {
    try std.testing.expectEqual(expType, @as(NodeType, node.node.*));
    try std.testing.expectEqual(expCommit, node.commit);

    const contentText = node.node.contentText(alloc);
    try std.testing.expectEqualStrings(expContentText, contentText);

    try std.testing.expectEqual(expChildren, node.transitions.items.len);
}
