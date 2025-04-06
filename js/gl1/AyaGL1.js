class AyaGL1 {
    static rootNode = "Token_space"
    static states = [
        new LangTreeNode(false, new LangNode_State("Variable"), [
            new LangTreeNode(false, new LangNode_ApplyTag("Variable"), [
                new LangTreeNode(true, new LangNode_MatchRegex("[a-z_]+"), []),
                new LangTreeNode(true, new LangNode_SubState("String", undefined), []),
                new LangTreeNode(true, new LangNode_MatchUnicode({minCodeInclusive: 127}), []),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("List"), [
            new LangTreeNode(false, new LangNode_ApplyTag("List"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("["), [
                    new LangTreeNode(false, new LangNode_MatchRegex("\\s*"), [
                        new LangTreeNode(true, new LangNode_SubState("Token_space", {
                            greedy: false,
                            minRepeat: 0,
                            maxRepeat: undefined
                        }), [
                            new LangTreeNode(true, new LangNode_MatchLiteral("]"), []),
                        ]),
                    ]),
                ]),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Block"), [
            new LangTreeNode(false, new LangNode_ApplyTag("Block"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("{"), [
                    new LangTreeNode(false, new LangNode_MatchRegex("\\s*"), [
                        new LangTreeNode(true, new LangNode_SubState("Token_space", {
                            greedy: false,
                            minRepeat: 0,
                            maxRepeat: undefined
                        }), [
                            new LangTreeNode(true, new LangNode_MatchLiteral("}"), []),
                        ]),
                    ]),
                ]),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Lambda"), [
            new LangTreeNode(false, new LangNode_ApplyTag("Lambda"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("("), [
                    new LangTreeNode(false, new LangNode_MatchRegex("\\s*"), [
                        new LangTreeNode(true, new LangNode_SubState("Token_space", {
                            greedy: false,
                            minRepeat: 0,
                            maxRepeat: undefined
                        }), [
                            new LangTreeNode(true, new LangNode_MatchLiteral(")"), []),
                        ]),
                    ]),
                ]),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("EOL"), [
            new LangTreeNode(true, new LangNode_MatchRegex("[^\\n]*"), []),
        ]),
        new LangTreeNode(false, new LangNode_State("EOB"), [
            new LangTreeNode(true, new LangNode_MatchRegex(".*?\\.}"), []),
        ]),
        /*new LangTreeNode(false, new LangNode_State("StringChar"), [
            new LangTreeNode(false, new LangNode_MatchLiteral("\\"), [
                new LangTreeNode(false, new LangNode_ApplyTag("SpecialChar"), [
                    new LangTreeNode(true, new LangNode_MatchRegex("\\{.*?\\}"), []),
                ]),
                new LangTreeNode(false, new LangNode_ApplyTag("EscapeChar"), [
                    new LangTreeNode(true, new LangNode_MatchRegex("."), []),
                ]),
            ]),
            new LangTreeNode(true, new LangNode_MatchRegex("."), []),
        ]),*/
        new LangTreeNode(false, new LangNode_State("StringChar"), [
            new LangTreeNode(false, new LangNode_ApplyTag("SpecialChar"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\\\\\\{.*?\\}"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("EscapeChar"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\\\\."), []),
            ]),
            new LangTreeNode(true, new LangNode_MatchRegex("."), []),
        ]),
        new LangTreeNode(false, new LangNode_State("String"), [
            new LangTreeNode(false, new LangNode_ApplyTag("StringLiteral"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("\""), [
                    new LangTreeNode(true, new LangNode_SubState("StringChar", {
                        greedy: false,
                        minRepeat: 0,
                        maxRepeat: undefined
                    }), [
                        new LangTreeNode(true, new LangNode_MatchLiteral("\""), []),
                    ]),
                ]),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Number"), [
            new LangTreeNode(true, new LangNode_MatchRegex("-?[0-9]*\\.[0-9]+"), []),
            new LangTreeNode(true, new LangNode_MatchRegex("-?[0-9]+"), []),
        ]),
        new LangTreeNode(false, new LangNode_State("Integer"), [
            new LangTreeNode(true, new LangNode_MatchRegex("-?[0-9]+"), []),
        ]),
        new LangTreeNode(false, new LangNode_State("SpecialNumber"), [
            new LangTreeNode(false, new LangNode_ApplyTag("num_hex"), [
                new LangTreeNode(true, new LangNode_MatchRegex("0x-?[0-9a-f]+"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("num_bin"), [
                new LangTreeNode(true, new LangNode_MatchRegex("0b-?[01]+"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("num_imaginary"), [
                new LangTreeNode(false, new LangNode_SubState("Number", undefined), [
                    new LangTreeNode(true, new LangNode_MatchLiteral("i"), [
                        new LangTreeNode(true, new LangNode_SubState("Number", {
                            greedy: true,
                            minRepeat: 0,
                            maxRepeat: 1
                        }), []),
                    ]),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("num_rational"), [
                new LangTreeNode(false, new LangNode_SubState("Integer", undefined), [
                    new LangTreeNode(true, new LangNode_MatchLiteral("r"), [
                        new LangTreeNode(true, new LangNode_SubState("Integer", {
                            greedy: true,
                            minRepeat: 0,
                            maxRepeat: 1
                        }), []),
                    ]),
                ]),
                new LangTreeNode(false, new LangNode_SubState("Number", undefined), [
                    new LangTreeNode(true, new LangNode_MatchLiteral("r"), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("num_pi"), [
                new LangTreeNode(false, new LangNode_SubState("Number", undefined), [
                    new LangTreeNode(true, new LangNode_MatchLiteral("p"), [
                        new LangTreeNode(true, new LangNode_SubState("Number", {
                            greedy: true,
                            minRepeat: 0,
                            maxRepeat: 1
                        }), []),
                    ]),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("num_big"), [
                new LangTreeNode(false, new LangNode_SubState("Integer", undefined), [
                    new LangTreeNode(true, new LangNode_MatchLiteral("z"), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("num_root"), [
                new LangTreeNode(false, new LangNode_SubState("Number", undefined), [
                    new LangTreeNode(true, new LangNode_MatchLiteral("q"), [
                        new LangTreeNode(true, new LangNode_SubState("Number", {
                            greedy: true,
                            minRepeat: 0,
                            maxRepeat: 1
                        }), []),
                    ]),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("num_sci"), [
                new LangTreeNode(false, new LangNode_SubState("Number", undefined), [
                    new LangTreeNode(true, new LangNode_MatchLiteral("e"), [
                        new LangTreeNode(true, new LangNode_SubState("Number", {
                            greedy: true,
                            minRepeat: 0,
                            maxRepeat: 1
                        }), []),
                    ]),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("num_const"), [
                new LangTreeNode(false, new LangNode_SubState("Integer", undefined), [
                    new LangTreeNode(true, new LangNode_MatchLiteral("c"), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("num_str"), [
                new LangTreeNode(false, new LangNode_SubState("Integer", undefined), [
                    new LangTreeNode(true, new LangNode_MatchLiteral("s"), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("num_negate"), [
                new LangTreeNode(true, new LangNode_SubState("Integer", undefined), []),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Token"), [
            new LangTreeNode(false, new LangNode_ApplyTag("SetVariable"), [
                new LangTreeNode(false, new LangNode_MatchLiteral(".:"), [
                    new LangTreeNode(true, new LangNode_SubState("Variable", undefined), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("SetIndex"), [
                new LangTreeNode(false, new LangNode_MatchLiteral(".:"), [
                    new LangTreeNode(true, new LangNode_SubState("List", undefined), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("GetVariable"), [
                new LangTreeNode(false, new LangNode_MatchLiteral("."), [
                    new LangTreeNode(true, new LangNode_SubState("Variable", undefined), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("GetIndex"), [
                new LangTreeNode(false, new LangNode_MatchLiteral("."), [
                    new LangTreeNode(true, new LangNode_SubState("List", undefined), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("LineDoc"), [
                new LangTreeNode(true, new LangNode_MatchLiteral(".#?"), [
                    new LangTreeNode(true, new LangNode_SubState("EOL", undefined), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("LineComment"), [
                new LangTreeNode(true, new LangNode_MatchLiteral(".#"), [
                    new LangTreeNode(true, new LangNode_SubState("EOL", undefined), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("BlockDoc"), [
                new LangTreeNode(true, new LangNode_MatchLiteral(".{?"), [
                    new LangTreeNode(true, new LangNode_SubState("EOB", undefined), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("BlockComment"), [
                new LangTreeNode(true, new LangNode_MatchLiteral(".{"), [
                    new LangTreeNode(true, new LangNode_SubState("EOB", undefined), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("Symbol"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("::"), [
                    new LangTreeNode(true, new LangNode_SubState("String", undefined), []),
                    new LangTreeNode(true, new LangNode_MatchRegex("[a-z_]+"), []),
                    new LangTreeNode(true, new LangNode_MatchRegex("[M:\\.]?."), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("NamedOperator"), [
                new LangTreeNode(true, new LangNode_MatchRegex(":\\{.*?\\}"), []),
            ]),
            new LangTreeNode(false, new LangNode_MatchLiteral(":"), [
                new LangTreeNode(true, new LangNode_SubState("SpecialNumber", undefined), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("SetGlobalVariable"), [
                new LangTreeNode(false, new LangNode_MatchLiteral(":"), [
                    new LangTreeNode(true, new LangNode_SubState("Variable", undefined), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("ColonOperator"), [
                new LangTreeNode(true, new LangNode_MatchRegex(":."), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("MathOperator"), [
                new LangTreeNode(true, new LangNode_MatchRegex("M."), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("cDict"), [
                new LangTreeNode(true, new LangNode_MatchLiteral(String.fromCharCode(162)), [
                    new LangTreeNode(true, new LangNode_MatchRegex("."), []),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("LongStringLiteral"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\"\"\".*?\"\"\""), []),
            ]),
            new LangTreeNode(true, new LangNode_SubState("String", undefined), []),
            new LangTreeNode(false, new LangNode_ApplyTag("SpecialCharLiteral"), [
                new LangTreeNode(true, new LangNode_MatchRegex("'\\\\.*?'"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("CharLiteral"), [
                new LangTreeNode(true, new LangNode_MatchRegex("'."), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("NumberLiteral"), [
                new LangTreeNode(true, new LangNode_SubState("Number", undefined), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("GetGlobalVariable"), [
                new LangTreeNode(true, new LangNode_SubState("Variable", undefined), []),
            ]),
            new LangTreeNode(false, new LangNode_SubState("List", undefined), []),
            new LangTreeNode(false, new LangNode_SubState("Block", undefined), []),
            new LangTreeNode(false, new LangNode_SubState("Lambda", undefined), []),
            new LangTreeNode(false, new LangNode_ApplyTag("DotOperator"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\\.."), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("SpecialToken"), [
                new LangTreeNode(true, new LangNode_MatchRegex("[,`#]"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("Operator"), [
                new LangTreeNode(true, new LangNode_MatchRegex("[^\\s)}\\]]"), []),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Token_space"), [
            new LangTreeNode(false, new LangNode_MatchRegex("\\s*"), [
                new LangTreeNode(true, new LangNode_SubState("Token", undefined), [
                    new LangTreeNode(true, new LangNode_MatchRegex("\\s*"), []),
                ]),
            ]),
        ]),
        /*new LangTreeNode(false, new LangNode_State("Program"), [
            new LangTreeNode(true, new LangNode_SubState("Token_space", {greedy: true, minRepeat: 0, maxRepeat: undefined}), []),
        ]),*/
    ];
    static evaluator = new LangEvaluator(AyaGL1.states, AyaGL1.rootNode);
}