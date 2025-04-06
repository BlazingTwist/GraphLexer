class RegexGL1 {
    static rootNode = "Regex";
    static states = [
        new LangTreeNode(false, new LangNode_State("BoundaryAssertion"), [
            new LangTreeNode(false, new LangNode_ApplyTag("InputBegin"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("^"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("InputEnd"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("$"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("WordBoundary"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("\\b"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("NonWordBoundary"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("\\B"), []),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("EscapeChar"), [
            new LangTreeNode(false, new LangNode_ApplyTag("BackRef"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\\\\[1-9][0-9]*"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("BackRefNamed"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\\\\k<.*?>"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("ControlChar"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\\\\c[A-Z]"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("Hex"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\\\\x[0-9a-fA-F]{2}"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("Utf16"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\\\\u[0-9a-fA-F]{4}"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("Unicode"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\\\\u\\{[0-9a-fA-F]{4,5}\\}"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("UnicodeProperty"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\\\\[pP]\\{.*?\\}"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("EscapeChar"), [
                new LangTreeNode(true, new LangNode_MatchRegex("\\\\."), []),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("CharacterClassChar"), [
            new LangTreeNode(true, new LangNode_SubState("EscapeChar", undefined), []),
            new LangTreeNode(false, new LangNode_ApplyTag("Literal"), [
                new LangTreeNode(true, new LangNode_MatchRegex("[^\\]]"), []),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("CharacterClassRange"), [
            new LangTreeNode(false, new LangNode_ApplyTag("CharRange"), [
                new LangTreeNode(false, new LangNode_SubState("CharacterClassChar", undefined), [
                    new LangTreeNode(false, new LangNode_MatchLiteral("-"), [
                        new LangTreeNode(true, new LangNode_SubState("CharacterClassChar", undefined), []),
                    ]),
                ]),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("CharacterClassContent"), [
            new LangTreeNode(true, new LangNode_SubState("CharacterClassRange", undefined), []),
            new LangTreeNode(true, new LangNode_SubState("CharacterClassChar", undefined), []),
        ]),
        new LangTreeNode(false, new LangNode_State("CharacterClass"), [
            new LangTreeNode(false, new LangNode_ApplyTag("NegatedCharacterClass"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("[^"), [
                    new LangTreeNode(true, new LangNode_SubState("CharacterClassContent", { greedy: true, minRepeat: 0, maxRepeat: undefined }), [
                        new LangTreeNode(true, new LangNode_MatchLiteral("]"), []),
                    ]),
                ])
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("CharacterClass"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("["), [
                    new LangTreeNode(true, new LangNode_SubState("CharacterClassContent", { greedy: true, minRepeat: 0, maxRepeat: undefined }), [
                        new LangTreeNode(true, new LangNode_MatchLiteral("]"), []),
                    ]),
                ])
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Lookaround"), [
            new LangTreeNode(false, new LangNode_ApplyTag("Lookahead"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("(?="), [
                    new LangTreeNode(true, new LangNode_SubState("Regex", { greedy: false, minRepeat: 0, maxRepeat: undefined }), [
                        new LangTreeNode(true, new LangNode_MatchLiteral(")"), []),
                    ]),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("NegativeLookahead"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("(?!"), [
                    new LangTreeNode(true, new LangNode_SubState("Regex", { greedy: false, minRepeat: 0, maxRepeat: undefined }), [
                        new LangTreeNode(true, new LangNode_MatchLiteral(")"), []),
                    ]),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("Lookbehind"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("(?<="), [
                    new LangTreeNode(true, new LangNode_SubState("Regex", { greedy: false, minRepeat: 0, maxRepeat: undefined }), [
                        new LangTreeNode(true, new LangNode_MatchLiteral(")"), []),
                    ]),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("NegativeLookbehind"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("(?<!"), [
                    new LangTreeNode(true, new LangNode_SubState("Regex", { greedy: false, minRepeat: 0, maxRepeat: undefined }), [
                        new LangTreeNode(true, new LangNode_MatchLiteral(")"), []),
                    ]),
                ]),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Flags"), [
            new LangTreeNode(false, new LangNode_ApplyTag("Flags"), [
                new LangTreeNode(true, new LangNode_MatchRegex("[ims]*"), []),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("GroupName"), [
            new LangTreeNode(false, new LangNode_ApplyTag("Name"), [
                new LangTreeNode(true, new LangNode_MatchRegex("[^>]*"), []),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("GroupType"), [
            new LangTreeNode(false, new LangNode_ApplyTag("TypeNonCapturing"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("?:"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("TypeNamed"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("?<"), [
                    new LangTreeNode(true, new LangNode_SubState("GroupName", undefined), [
                        new LangTreeNode(true, new LangNode_MatchLiteral(">"), []),
                    ]),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("TypeFlagged"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("?"), [
                    new LangTreeNode(true, new LangNode_SubState("Flags", undefined), [
                        new LangTreeNode(true, new LangNode_MatchLiteral("-"), [
                            new LangTreeNode(true, new LangNode_SubState("Flags", undefined), [
                                new LangTreeNode(true, new LangNode_MatchLiteral(":"), []),
                            ]),
                        ]),
                        new LangTreeNode(true, new LangNode_MatchLiteral(":"), []),
                    ]),
                ]),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("CaptureGroup"), [
            new LangTreeNode(false, new LangNode_ApplyTag("CaptureGroup"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("("), [
                    new LangTreeNode(true, new LangNode_SubState("GroupType", { greedy: true, minRepeat: 0, maxRepeat: 1 }), [
                        new LangTreeNode(true, new LangNode_SubState("Regex", { greedy: false, minRepeat: 0, maxRepeat: undefined }), [
                            new LangTreeNode(true, new LangNode_MatchLiteral(")"), []),
                        ]),
                    ]),
                ]),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Integer"), [
            new LangTreeNode(false, new LangNode_ApplyTag("Int"), [
                new LangTreeNode(true, new LangNode_MatchRegex("[0-9]+"), []),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("QuantifierType"), [
            new LangTreeNode(false, new LangNode_ApplyTag("Type"), [
                new LangTreeNode(true, new LangNode_MatchRegex("[*+?]"), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("Type{n}"), [
                new LangTreeNode(false, new LangNode_MatchLiteral("{"), [
                    new LangTreeNode(false, new LangNode_SubState("Integer", undefined), [
                        new LangTreeNode(true, new LangNode_MatchLiteral("}"), []),
                    ]),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("Type{n,}"), [
                new LangTreeNode(false, new LangNode_MatchLiteral("{"), [
                    new LangTreeNode(false, new LangNode_SubState("Integer", undefined), [
                        new LangTreeNode(true, new LangNode_MatchLiteral(",}"), []),
                    ]),
                ]),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("Type{n,m}"), [
                new LangTreeNode(false, new LangNode_MatchLiteral("{"), [
                    // Implementations differ here, some require the lower bound, others assume 0 for `{,m}`
                    new LangTreeNode(false, new LangNode_SubState("Integer", undefined), [
                        new LangTreeNode(false, new LangNode_MatchLiteral(","), [
                            new LangTreeNode(false, new LangNode_SubState("Integer", undefined), [
                                new LangTreeNode(true, new LangNode_MatchLiteral("}"), []),
                            ]),
                        ]),
                    ]),
                ]),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Quantifier"), [
            new LangTreeNode(false, new LangNode_ApplyTag("Quantifier"), [
                new LangTreeNode(true, new LangNode_SubState("QuantifierType", undefined), [
                    new LangTreeNode(false, new LangNode_ApplyTag("NonGreedy"), [
                        new LangTreeNode(true, new LangNode_MatchLiteral("?"), []),
                    ]),
                    new LangTreeNode(true, new LangNode_MatchLiteral(""), []),
                ]),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Literal"), [
            new LangTreeNode(false, new LangNode_ApplyTag("Literal"), [
                new LangTreeNode(true, new LangNode_MatchRegex("."), []),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Wildcard"), [
            new LangTreeNode(false, new LangNode_ApplyTag("Wildcard"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("."), []),
            ]),
        ]),
        new LangTreeNode(false, new LangNode_State("Regex"), [
            new LangTreeNode(true, new LangNode_SubState("CharacterClass", undefined), [
                new LangTreeNode(true, new LangNode_SubState("Quantifier", { greedy: true, minRepeat: 0, maxRepeat: 1 }), []),
            ]),
            new LangTreeNode(true, new LangNode_SubState("Lookaround", undefined), [
                new LangTreeNode(true, new LangNode_SubState("Quantifier", { greedy: true, minRepeat: 0, maxRepeat: 1 }), []),
            ]),
            new LangTreeNode(true, new LangNode_SubState("CaptureGroup", undefined), [
                new LangTreeNode(true, new LangNode_SubState("Quantifier", { greedy: true, minRepeat: 0, maxRepeat: 1 }), []),
            ]),
            new LangTreeNode(false, new LangNode_ApplyTag("Disjunction"), [
                new LangTreeNode(true, new LangNode_MatchLiteral("|"), []),
            ]),
            new LangTreeNode(false, new LangNode_SubState("Wildcard", undefined), [
                new LangTreeNode(true, new LangNode_SubState("Quantifier", { greedy: true, minRepeat: 0, maxRepeat: 1 }), []),
            ]),
            new LangTreeNode(true, new LangNode_SubState("BoundaryAssertion", undefined), []),
            new LangTreeNode(true, new LangNode_SubState("EscapeChar", undefined), [
                new LangTreeNode(true, new LangNode_SubState("Quantifier", { greedy: true, minRepeat: 0, maxRepeat: 1 }), []),
            ]),
            new LangTreeNode(true, new LangNode_SubState("Literal", undefined), [
                new LangTreeNode(true, new LangNode_SubState("Quantifier", { greedy: true, minRepeat: 0, maxRepeat: 1 }), []),
            ]),
        ])
    ];
    static evaluator = new LangEvaluator(RegexGL1.states, RegexGL1.rootNode);
}