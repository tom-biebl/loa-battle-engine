loa-battle-engine/
│
├── dist/                              # Build-Output (kompiliert, minifiziert)
│   ├── loa-battle-engine.js          # Kompiliertes JavaScript (aus src/)
│   ├── loa-battle-engine.js.map      # Source Map (für Debugging)
│   └── loa-battle-engine.css         # Kompiliertes CSS (aus styles/)
│
├── src/                               # TypeScript/JavaScript Source Code
│   │
│   ├── index.ts                      # Entry Point
│   │
│   ├── BattleEngine.ts               # Haupt-Klasse (orchestriert alles)
│   │
│   ├── managers/                     # Manager-Komponenten
│   │   ├── StackManager.ts           # Stack-Daten verwalten
│   │   ├── ActionMacroDetector.ts    # [A], [B], [R] Macros identifizieren
│   │   ├── HotbarUIManager.ts        # Hotbar-Highlighting
│   │   ├── GMDialogManager.ts        # GM-Dialog öffnen/verwalten
│   │   ├── ActionTriggerSystem.ts    # useAction/useBonusAction/useReaction
│   │   └── ChatIntegration.ts        # Chat-Messages
│   │
│   ├── models/                       # Datenmodelle (TypeScript Interfaces/Classes)
│   │   ├── StackItem.ts              # Stack-Item Interface + Klasse
│   │   ├── BattleEngineState.ts      # Kompletter State
│   │   ├── ActionData.ts             # Action-Payload
│   │   ├── BonusActionData.ts        # Bonus Action-Payload
│   │   └── ReactionData.ts           # Reaction-Payload
│   │
│   ├── ui/                           # UI-Komponenten
│   │   ├── dialogs/
│   │   │   └── StackDialog.ts        # GM-Dialog Klasse
│   │   ├── hotbar/
│   │   │   └── HotbarHighlighter.ts  # Hotbar-DOM-Manipulation
│   │   └── chat/
│   │       └── ChatRenderer.ts       # Chat-Message Rendering
│   │
│   ├── hooks/                        # Foundry Hooks
│   │   ├── CombatHooks.ts            # combatStart, combatTurn, combatEnd
│   │   ├── CanvasHooks.ts            # canvasReady
│   │   └── SocketHooks.ts            # Custom Socket Events
│   │
│   ├── utils/                        # Utility-Funktionen
│   │   ├── Logger.ts                 # Logging-Utility
│   │   ├── Helpers.ts                # Allgemeine Hilfsfunktionen
│   │   └── Constants.ts              # Module-weite Konstanten
│   │
│   └── types/                        # Global Type Definitions
│       └── index.d.ts                # Foundry Types + Custom Types
│
├── styles/                            # CSS/SCSS Source
│   ├── main.css                      # Haupt-Stylesheet
│   ├── dialog.css                    # GM-Dialog Styles
│   ├── hotbar.css                    # Hotbar-Highlighting Styles
│   └── animations.css                # Animations (@keyframes)
│
├── lang/                              # Lokalisierung
│   ├── de.json                       # Deutsch (für Deine Gruppe)
│   └── en.json                       # English (optional)
│
├── docs/                              # Dokumentation
│   ├── README.md                     # Overview + Installation
│   ├── USAGE.md                      # Wie man das Modul nutzt
│   ├── API.md                        # Public API Dokumentation
│   ├── ARCHITECTURE.md               # Code-Architektur
│   └── TROUBLESHOOTING.md            # FAQ + Häufige Probleme
│
├── tests/                             # Unit Tests
│   ├── unit/
│   │   ├── StackManager.test.ts
│   │   ├── ActionMacroDetector.test.ts
│   │   └── BattleEngine.test.ts
│   └── integration/
│       └── FoundryIntegration.test.ts
│
├── build/                             # Build-Konfiguration
│   └── webpack.config.js             # Webpack Config
│
├── .github/                           # GitHub Konfiguration
│   └── workflows/
│       └── release.yml               # Auto-Release auf GitHub
│
├── .gitignore                        # Git Ignore
├── package.json                      # NPM Dependencies
├── tsconfig.json                     # TypeScript Konfiguration
├── webpack.config.js                 # Webpack Konfiguration (alternativ zu build/)
├── CHANGELOG.md                      # Version History
└── LICENSE                           # MIT License