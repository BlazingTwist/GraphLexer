// see https://github.com/mnemnion/mvzr/issues/5

const std = @import("std");
const mvzr = @import("../lib/mvzr/src/mvzr.zig");

test "zero length match on zero length haystack" {
    const regex = mvzr.compile(".*");
    const match = regex.?.match("");
    try std.testing.expect(match != null);
    try std.testing.expectEqual(0, match.?.start);
    try std.testing.expectEqual(0, match.?.end);
}
