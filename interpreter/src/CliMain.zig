/// TODO:
/// - implement Wasm api
/// - implement CLI api with instancing
const std = @import("std");
const FixedBufferAllocator = @import("std").heap.FixedBufferAllocator;

const GraphLexer = @import("LibMain.zig");
const Deserializer = GraphLexer.Deserializer;
const Evaluator = GraphLexer.Evaluator;
const LangTagTree = Evaluator.LangTagTree;

const testInput = @embedFile("example/testInput.txt");

fn printTag(alloc: std.mem.Allocator, tag: LangTagTree, depth: usize) void {
    var indent = alloc.alloc(u8, depth) catch unreachable;
    for (0..depth) |i| {
        indent[i] = ' ';
    }
    defer alloc.free(indent);

    if (tag.len < 16) {
        std.debug.print("{s} tag={s} | '{s}'\n", .{ indent, tag.name, testInput[tag.index..(tag.index + tag.len)] });
    } else {
        std.debug.print("{s} tag={s} | idx={}, len={}\n", .{ indent, tag.name, tag.index, tag.len });
    }

    for (tag.subTags) |subTag| {
        printTag(alloc, subTag, depth + 1);
    }
}

const tagSize = @sizeOf(LangTagTree);
fn measureTagMemorySize(tags: []LangTagTree) usize {
    var result = tags.len * tagSize;
    for (tags) |tag| {
        result += measureTagMemorySize(tag.subTags);
    }
    return result;
}

pub fn main() !void {
    const stdOut = std.io.getStdOut().writer();

    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const alloc = gpa.allocator();

    const desStartTime = std.time.microTimestamp();
    var langDefArena = std.heap.ArenaAllocator.init(alloc);
    defer langDefArena.deinit();
    const serialized = @embedFile("example/aya.serialized.lang");
    const deserialized = try Deserializer.deserialize(langDefArena.allocator(), serialized);
    const desStopTime = std.time.microTimestamp();
    try stdOut.print("num nodes: {}\n", .{deserialized.items.len});
    try stdOut.print("deserialization took {} microseconds\n", .{desStopTime - desStartTime});

    const testBuf = try alloc.alloc(u8, 64 * 1024 * 1024);
    var fba = std.heap.FixedBufferAllocator.init(testBuf);
    var totalTime: i128 = 0;
    for (0..4) |i| {
        const evalStartTime = std.time.nanoTimestamp();
        const allRes = Evaluator.evaluateAll(false, fba.allocator(), deserialized, 12, testInput, null);
        const evalStopTime = std.time.nanoTimestamp();
        totalTime += evalStopTime - evalStartTime;
        std.debug.print("{} took {} nanos for eval | matchLen: {} / {} | err? {s}\n", .{ i, evalStopTime - evalStartTime, allRes.matchLen, testInput.len, if (allRes.failure) |f| @tagName(f.failType) else "" });
        std.debug.print("used {} bytes\n", .{fba.end_index});
        fba.reset();
    }
    std.debug.print("total: {}", .{totalTime});
    std.debug.print("size of node {}", .{@sizeOf(LangTagTree)});

    // var evalArena = std.heap.ArenaAllocator.init(fba.allocator());
    // defer evalArena.deinit();
    // const allRes = Evaluator.evaluateAll(evalArena.allocator(), deserialized, 12, testInput, null);

    // for (allRes.matchTags) |rootTag| {
    //     printTag(alloc, rootTag, 0);
    // }

    //if (allRes.failure) |f| {
    //    try stdOut.print(
    //        "no match, failType: {s} | message: {s} | committed: {s}\n",
    //        .{ @tagName(f.failType), f.message, f.committedInput },
    //    );
    //}

    //if (allRes.matchLen < testInput.len) {
    //    try stdOut.print("unmatched input: '{s}'\n", .{testInput[allRes.matchLen..]});
    //}
}
