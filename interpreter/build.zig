const std = @import("std");
const Build = std.Build;
const ResolvedTarget = std.Build.ResolvedTarget;
const OptimizeMode = std.builtin.OptimizeMode;

const BuildConfig = struct {
    graph_lexer_module: *std.Build.Module,
    target: ResolvedTarget,
    optimize: OptimizeMode,
    doRun: bool,
};
var buildConfig: BuildConfig = undefined;

fn add_build_lib(b: *Build) !void {
    const make_lib = b.option(bool, "make-lib", "Compile the interpreter as a static library.") orelse false;
    if (!make_lib) {
        return;
    }

    const lib = b.addStaticLibrary(.{
        .name = "GraphLexer",
        .root_source_file = b.path("src/LibMain.zig"),
        .target = buildConfig.target,
        .optimize = buildConfig.optimize,
    });
    const install_step = b.addInstallArtifact(lib, .{});
    b.getInstallStep().dependOn(&install_step.step);
}

fn add_build_cli(b: *Build) !void {
    const make_cli = b.option(bool, "make-cli", "Compile the interpreter as a Command-Line Application.") orelse false;
    if (!make_cli) {
        return;
    }

    const exe = b.addExecutable(.{
        .name = "GraphLexer-Cli",
        .root_source_file = b.path("src/CliMain.zig"),
        .target = buildConfig.target,
        .optimize = buildConfig.optimize,
    });
    exe.root_module.addImport("LibMain.zig", buildConfig.graph_lexer_module);

    const install_step = b.addInstallArtifact(exe, .{});
    b.getInstallStep().dependOn(&install_step.step);

    if (buildConfig.doRun) {
        const run_step = b.addRunArtifact(exe);
        b.getInstallStep().dependOn(&run_step.step);
    }
}

fn add_build_wasm(b: *Build) !void {
    const make_wasm = b.option(bool, "make-wasm", "Compile the interpreter as a Module that can be used in WebAssembly") orelse false;
    if (!make_wasm) {
        return;
    }

    const target = blk: {
        if (!std.Target.isWasm(buildConfig.target.result)) {
            std.debug.print(
                "target {s}-{s} is not a valid target for wasm build. will use wasm32-freestanding\n",
                .{ @tagName(buildConfig.target.result.cpu.arch), @tagName(buildConfig.target.result.os.tag) },
            );
            break :blk b.resolveTargetQuery(.{
                .os_tag = std.Target.Os.Tag.freestanding,
                .cpu_arch = std.Target.Cpu.Arch.wasm32,
            });
        } else {
            break :blk buildConfig.target;
        }
    };

    const exe = b.addExecutable(.{
        .name = "GraphLexer-Wasm",
        .root_source_file = b.path("src/WasmMain.zig"),
        .target = target,
        .optimize = buildConfig.optimize,
    });
    // based on absolutely nothing https://ziggit.dev/t/build-wasm-using-zig-build-system-when-ther-is-no-entry-point-but-function-to-export/4364/2
    exe.rdynamic = true;
    exe.entry = .disabled;
    exe.import_memory = true; // https://github.com/ziglang/zig/issues/8633
    exe.root_module.addImport("LibMain.zig", buildConfig.graph_lexer_module);

    // explicitly set initial memory so compilation fails if it grows...
    // because in that case the JS implementation must be updated as well.
    exe.initial_memory = std.wasm.page_size * 17;

    const install_step = b.addInstallArtifact(exe, .{});
    b.getInstallStep().dependOn(&install_step.step);
}

fn run_tests(b: *Build) !void {
    const do_test = b.option(bool, "test", "Run all tests") orelse false;
    if (!do_test) {
        return;
    }

    const tests = b.addTest(.{
        .root_source_file = b.path("src/TestsMain.zig"),
        .target = buildConfig.target,
    });
    const run_test = b.addRunArtifact(tests);
    b.getInstallStep().dependOn(&run_test.step);
}

pub fn build(b: *std.Build) !void {
    buildConfig = .{
        .graph_lexer_module = undefined,
        .target = b.standardTargetOptions(.{}),
        .optimize = b.standardOptimizeOption(.{
            .preferred_optimize_mode = OptimizeMode.ReleaseFast,
        }),
        .doRun = b.option(bool, "run", "run the compiled application(s)") orelse false,
    };

    buildConfig.graph_lexer_module = b.addModule("GraphLexer", .{
        .root_source_file = b.path("src/LibMain.zig"),
        .target = buildConfig.target,
        .optimize = buildConfig.optimize,
    });
    buildConfig.graph_lexer_module.addIncludePath(b.path("src/"));
    buildConfig.graph_lexer_module.addIncludePath(b.path("src/lib/mvzr/src/"));

    try run_tests(b);

    try add_build_lib(b);
    try add_build_cli(b);
    try add_build_wasm(b);
}
