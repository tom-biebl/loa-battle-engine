# Technische Anforderungsspezifikation
## CSB Battle Engine Modul

**Version:** 1.0  
**Datum:** April 2026  
**Status:** Anforderungsdefinition  
**Zielgruppe:** Entwicklung für proprietäres CSB-Regelwerk in Foundry VTT

---

## 1. Überblick & Motivation

### 1.1 Zweck
Das CSB Battle Engine Modul implementiert ein **Stack-basiertes Aktions-/Reaktions-System** (inspiriert von Magic The Gathering) für das proprietäre CSB-Regelwerk in Foundry VTT. Es bietet dem GM vollständige Kontrolle über den Kampffluss und ermöglicht echte taktische Tiefe ohne komplexe Automatisierung.

### 1.2 Zielgruppe
- Exklusiv für die eigene CSB-Regelwerk-Gruppe
- Nicht für öffentliche Distribution
- Spieler mit variabler technischer Kompetenz

### 1.3 Design-Philosophie
- **GM-zentral:** Der GM ist die Autorität über alle Stack-Operationen
- **Minimal invasiv:** Keine invasiven UI-Elemente, keine Dialog-Spam
- **Elegant:** Stack-Logik ist zentral und transparent
- **Flexibel:** GM kann Fehler korrigieren und improvisieren

---

## 2. Kern-Konzepte

### 2.1 Action/Bonus Action/Reaction System

**Pro Turn (für einen Charakter):**
- 1 Action (z.B. Spell casten, Attacke, Aktion)
- 1 Bonus Action (zusätzliche schnelle Aktion, z.B. schnelle Zauber, Bewegung)
- 1 Reaction (kann nur reagieren, wenn Bedingung erfüllt)

**Macro-Kategorisierung (Präfix-System):**
- **Action Macros:** Präfix `[A]` im Macro-Namen (z.B. `[A] Fireball`, `[A] Attack`, `[A] Cast Spell`)
- **Bonus Action Macros:** Präfix `[B]` im Macro-Namen (z.B. `[B] Quick Heal`, `[B] Bonus Movement`, `[B] Cunning Action`)
- **Reaction Macros:** Präfix `[R]` im Macro-Namen (z.B. `[R] Counterspell`, `[R] Shield`, `[R] Dodge`)

### 2.2 Stack-Logik (LIFO - Last In, First Out)

```
Zeitablauf:
1. Spieler castet Action → Action landet im Stack
2. GM-Dialog öffnet sich mit Stack-Übersicht
3. GM ruft: "Wer will reagieren?"
4. Spieler klicken ihre [R]-Macros → Reaktionen kommen in Stack
5. Weitere Reaktionen auf Reaktionen möglich (Kaskadeneffekt)
6. GM klickt "Resolve" → Stack resolved in umgekehrter Reihenfolge (LIFO)
   - Letzte Reaktion zuerst
   - Dann vorherige Reaktionen
   - Dann Original-Aktion
7. Effekte werden angewendet
```

**Beispiel:**
```
Stack-Zustand:
├─ [1] ACTION [A]: Wizard castet "[A] Fireball"
│  ├─ [2] REACTION [R]: Cleric castet "[R] Counterspell" 
│  │  └─ [3] REACTION [R]: Sorcerer castet "[R] Dispel Magic"
│  └─ [4] REACTION [R]: Rogue castet "[R] Evasion"

Resolution (umgekehrte Reihenfolge):
1. Dispel Magic resolved (auf Counterspell)
2. Counterspell resolved (auf Fireball) → Fireball ist cancelled
3. Evasion resolved (hat keine Wirkung, da Fireball weg)
4. Fireball resolved (aber cancelled) → kein Schaden
```

### 2.3 Keine automatische TTL
- **Kein Zeitdruck für Spieler**
- GM kontrolliert wann "Reaktions-Fenster" endet
- GM fragt explizit: "Wer will reagieren?" und "Jemand noch?"

---

## 3. Technische Architektur

### 3.1 Datenstrukturen

#### Stack-Item
```javascript
{
  id: "unique-uuid",           // Eindeutige ID
  type: "action" | "reaction", // Typ
  casterId: "actor-id",        // Wer castet das (Actor-ID)
  casterName: "Character Name",// Name des Casters (Display)
  macroId: "macro-id",         // Referenz zum Macro
  macroName: "[R] Counterspell",// Anzeigename
  targetId: "actor-id" | null, // Ziel (falls relevant)
  targetName: string | null,   // Zielname
  parentStackId: "uuid" | null,// Falls Reaktion: Parent-Action
  timestamp: number,           // Wann wurde es gepusht
  status: "pending" | "resolved" | "cancelled", // Status
  metadata: {                  // Zusatz-Daten
    description: string,       // Was passiert
    effects: [],              // Zugehörige Effekte/Schäden
    customNotes: string       // GM-Notizen
  }
}
```

#### Battle Engine State
```javascript
{
  isStackOpen: boolean,        // Ist der Stack aktiv?
  currentStack: [StackItem],   // Array von Stack-Items
  combatId: "combat-id",       // Bezug zum Combat
  gmUserId: "user-id",         // Wer ist GM
  lastUpdated: timestamp,      // Letzter Update
  resolvedStacks: [            // Historie (für Logging)
    {
      stackId: "uuid",
      resolvedAt: timestamp,
      items: [StackItem]
    }
  ]
}
```

### 3.2 Module & Komponenten

#### Component 1: Stack Manager
**Verantwortung:** Stack-Daten verwalten, Items adden/entfernen, State speichern

**Funktionen:**
- `pushToStack(stackItem)` – Aktion/Reaktion hinzufügen
- `removeFromStack(stackItemId)` – Item entfernen
- `getStack()` – Aktuellen Stack abrufen
- `resolveStack(resolutionOrder)` – Stack nach GM-Konfirmation auflösen
- `clearStack()` – Stack leeren (z.B. Turn-Ende)
- `getStackHistory()` – Gelöste Stacks abrufen (Logging)

**Persistierung:**
- Stack als Flag auf Scene speichern: `flags.csb-battle-engine.currentStack`
- History als Flag: `flags.csb-battle-engine.resolvedStacks`

#### Component 2: Action Macro Detector
**Verantwortung:** [A], [B], [R]-Macros identifizieren und verwalten

**Funktionen:**
- `getAllActionMacros()` – Alle [A]-Macros im System finden
- `getAllBonusActionMacros()` – Alle [B]-Macros im System finden
- `getAllReactionMacros()` – Alle [R]-Macros im System finden
- `getAvailableActions(forActor)` – Welche Actions hat Spieler verfügbar
- `getAvailableBonusActions(forActor)` – Welche Bonus Actions hat Spieler verfügbar
- `getAvailableReactions(forActor)` – Welche Reactions hat Spieler verfügbar
- `getMacroType(macroName)` – Gibt Typ zurück: "action" | "bonus" | "reaction" | null

**Implementation:**
- Parst alle Macro-Namen nach `[A]`, `[B]`, `[R]` Präfix
- Speichert Listen für schnellen Zugriff
- Validiert dass Präfixe korrekt gesetzt sind

#### Component 3: Hotbar UI Manager
**Verantwortung:** [A]-, [B]-, und [R]-Macro-Buttons in der Hotbar visuell markieren

**Funktionen:**
- `highlightActionMacros(actionList)` – [A]-Macros mit Farbe hervorheben (z.B. orange)
- `highlightBonusActionMacros(bonusList)` – [B]-Macros mit Farbe hervorheben (z.B. blau)
- `highlightReactionMacros(reactionList)` – [R]-Macros mit Farbe hervorheben (z.B. gelb)
- `unhighlightAllMacros()` – Alle Highlights entfernen
- `addActionMacroClickListener()` – Click-Listener für [A]-Macros adden
- `addBonusActionMacroClickListener()` – Click-Listener für [B]-Macros adden
- `addReactionMacroClickListener()` – Click-Listener für [R]-Macros adden

**Implementation:**
- Manipuliert DOM der Hotbar (`#hotbar`)
- Fügt CSS-Klassen `action-available`, `bonus-action-available`, `reaction-available` hinzu
- Styling: unterschiedliche Farben pro Typ
- Hook: Wenn Spieler auf Macro klickt → `useAction()`, `useBonusAction()` oder `useReaction()` triggern

**CSS (Vanilla Foundry):**
```css
/* Action Macros */
.action-available {
  border: 3px solid #FF8C00 !important;  /* Orange */
  box-shadow: 0 0 10px rgba(255, 140, 0, 0.6);
  animation: pulse 1.5s infinite;
}

/* Bonus Action Macros */
.bonus-action-available {
  border: 3px solid #4169E1 !important;  /* Royal Blue */
  box-shadow: 0 0 10px rgba(65, 105, 225, 0.6);
  animation: pulse 1.5s infinite;
}

/* Reaction Macros */
.reaction-available {
  border: 3px solid #FFD700 !important;  /* Gold/Yellow */
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

#### Component 4: GM Dialog Manager
**Verantwortung:** Dialog für GM mit Stack-Übersicht und Kontrollen

**Funktionen:**
- `openStackDialog()` – Dialog öffnen
- `updateStackDisplay(stack)` – Stack-Liste aktualisieren
- `renderStackItem(item)` – Einzelnes Item rendern
- `handleResolveClick(resolutionOrder)` – "Resolve" Button
- `handleModifyStack()` – Änderungen erlauben

**Dialog-Inhalt:**
```
┌─────────────────────────────────────────┐
│ CSB Battle Engine - Stack Resolver       │
├─────────────────────────────────────────┤
│ Combat: [Combat-Name] | Round: [X]      │
├─────────────────────────────────────────┤
│                                           │
│ STACK (LIFO-Reihenfolge):                │
│                                           │
│ [1] ▼ [A] ACTION: Wizard "Fireball"      │
│     Ziel: Goblin (Group A)               │
│     Status: Pending                      │
│     [Edit] [Remove]                      │
│                                           │
│   [2] ► [R] REACTION: Cleric "[R] Cntrs"│
│       Parent: Fireball                   │
│       Status: Pending                    │
│       [Edit] [Remove]                    │
│                                           │
│   [3] ► [R] REACTION: Sorcerer "[R] Disp"│
│       Parent: Counterspell               │
│       Status: Pending                    │
│       [Edit] [Remove]                    │
│                                           │
│   [4] ► [R] REACTION: Rogue "[R] Evasion"│
│       Parent: Fireball                   │
│       Status: Pending                    │
│       [Edit] [Remove]                    │
│                                           │
│ [Wer will noch reagieren?] [Keine mehr]  │
│                                           │
├─────────────────────────────────────────┤
│ [⚡ RESOLVE STACK] [❌ Abbrechen]         │
└─────────────────────────────────────────┘
```

**Funktionalität:**
- Live-Update wenn neue Reaktion hinzukommt
- Edit-Button: Allows GM to modify/correct entries
- Remove-Button: GM kann Einträge löschen
- Resolve-Button: Stack in Reihenfolge auflösen
- Nur GM kann diesen Dialog öffnen/ändern

#### Component 5: Action Trigger System
**Verantwortung:** Wenn Aktion/Bonus Action/Reaktion gecastet wird → Stack & Dialog

**Funktionen:**
- `useAction(actionData)` – Wird von [A]-Macros aufgerufen
- `useBonusAction(bonusData)` – Wird von [B]-Macros aufgerufen
- `useReaction(reactionData)` – Wird von [R]-Macros aufgerufen
- `triggerStackDialog()` – Dialog für GM öffnen
- `triggerReactionPhase()` – Spieler dürfen reagieren (Button Highlighting)

**Hooks & Integration:**
```javascript
// Beispiel [A] Action-Macro:
await BattleEngine.useAction({
  actorId: game.user.character.id,
  macroId: this.id,
  macroName: this.name,
  targetId: game.user.targets.ids[0] || null,
  description: "Castet Fireball"
})

// Beispiel [B] Bonus Action-Macro:
await BattleEngine.useBonusAction({
  actorId: game.user.character.id,
  macroId: this.id,
  macroName: this.name,
  targetId: game.user.targets.ids[0] || null,
  description: "Schneller Heilzauber"
})

// Beispiel [R] Reaction-Macro:
// (Wird automatisch erkannt via [R] Präfix)
// Spieler klickt einfach auf [R] Macro in Hotbar
// System macht den Rest

// System macht dann:
// 1. Stack-Item erstellen
// 2. Zu Stack adden
// 3. GM-Dialog öffnen/updaten
// 4. Relevante Macros in Hotbar highlighten
// 5. Message im Chat: "Aktion gecastet, wer reagiert?"
```

#### Component 6: Chat Integration
**Verantwortung:** Messaging an Spieler (wer was gecastet hat, wer reagieren kann, etc.)

**Funktionen:**
- `announceAction(stackItem)` – Sagt an welche [A]-Aktion gecastet wurde
- `announceBonusAction(stackItem)` – Sagt an welche [B]-Bonus Action gecastet wurde
- `announceReactionPhase()` – "Wer will reagieren?"
- `announceResolution(resolutionOrder)` – Stack wurde resolvedt
- `logToChat(message)` – Allgemeines Logging

**Stil:**
- Einfache Chat-Messages, keine Spam
- GM-only Messages wenn nötig
- Icons pro Typ:
  - ⚔️ für [A] Action
  - ⚡ für [B] Bonus Action
  - 🛡️ für [R] Reaction
- Optionale "History" Sidebar für Spieler

---

## 4. Workflow & Use Cases

### 4.1 Normaler Kampfablauf

```
SCHRITT 1: Action/Bonus Action Phase
├─ Spieler klickt [A]- oder [B]-Macro
├─ Macro ruft useAction() oder useBonusAction() auf
└─ Action/Bonus Action landet im Stack

SCHRITT 2: GM-Dialog öffnet
├─ GM sieht Stack-Dialog
├─ Chat-Nachricht: "⚔️ Fireball gecastet von Wizard" (oder ⚡ für Bonus)
├─ [R]-Macros werden in Hotbars gelb markiert
└─ GM ruft aus: "Wer will reagieren?"

SCHRITT 3: Reaction Phase
├─ Spieler klicken ihre [R]-Macros
├─ Jede Reaction kommt in Stack
├─ Dialog updated live (zeigt neue Reactions)
├─ GM fragt: "Noch jemand?"
└─ Spieler können mehrmals reagieren (Kaskadeneffekt)

SCHRITT 4: Resolution
├─ GM klickt "RESOLVE STACK"
├─ System resolved in LIFO-Reihenfolge
├─ Effekte werden angewendet
├─ Chat zeigt Resultat (mit Icons pro Typ)
├─ [R]-Macros werden unmarkiert
└─ Stack wird geleert
```

### 4.2 Edge Cases & GM-Funktionen

**GM kann während Dialog:**
- ❌ Falsche Reaction löschen
- ✏️ Reaction bearbeiten (z.B. Ziel ändern)
- ➕ Manuell weitere Reaction adden (falls Spieler Lag hatte)
- 🔄 Gesamte Stack-Reihenfolge neu ordnen
- ⏹️ Stack abbrechen (Aktion nicht casten)

**Beispiel Fehlerfall:**
```
Spieler A castet versehentlich falsches Spell.
↓
GM Dialog öffnet
↓
GM klickt [Remove] auf die falsche Aktion
↓
Stack aktualisiert
↓
GM kann neu anfangen oder korrigieren
```

### 4.3 Turn-Management

**Turn-Start (via Combat Tracker):**
- Action-Flag setzen: Actor.flags.csb-battle-engine.actionUsed = false
- Bonus Action-Flag setzen: Actor.flags.csb-battle-engine.bonusActionUsed = false
- Reaction-Flag setzen: Actor.flags.csb-battle-engine.reactionUsed = false
- [A]-, [B]-, und [R]-Macros unhighlighten (falls noch gehighlightet)

**Turn-End:**
- Stack clearen (falls noch Items drin)
- Alle Action/Bonus Action/Reaction Flags resetten für nächsten Charakter

---

## 5. Hooks & Foundry Integration

### 5.1 Foundry Hooks nutzen

```javascript
// Wenn ein Combat startet
Hooks.on("combatStart", (combat) => {
  BattleEngine.initializeCombat(combat);
});

// Wenn Turn wechselt
Hooks.on("combatTurn", (combat, combatant) => {
  BattleEngine.onTurnChange(combatant);
});

// Wenn Combat endet
Hooks.on("combatEnd", (combat) => {
  BattleEngine.onCombatEnd(combat);
});

// Wenn Szene wechselt
Hooks.on("canvasReady", () => {
  BattleEngine.loadSceneStack();
});
```

### 5.2 Custom Hooks
```javascript
// Eigene Hooks für Modul-Events
Hooks.call("csbBattleEngine.actionPushed", stackItem);
Hooks.call("csbBattleEngine.reactionPushed", stackItem);
Hooks.call("csbBattleEngine.stackResolved", resolvedStack);
```

### 5.3 Macro Integration
Macros müssen eingehakt werden in das System:

```javascript
// Beispiel Action-Macro:
await BattleEngine.useAction({
  casterId: game.user.character.id,
  casterName: game.user.character.name,
  macroId: this.id,
  macroName: this.name,
  targetId: game.user.targets.ids[0] || null,
  description: "Castet Fireball auf Goblin Group A"
});

// Beispiel Reaction-Macro:
// (Wird automatisch erkannt via [R] Präfix)
// Spieler klickt einfach auf [R] Macro in Hotbar
// System macht den Rest
```

---

## 6. Persistierung & Daten

### 6.1 Storage Location

**Scene Flags** (persistent über Session-Wechsel):
```javascript
scene.setFlag("csb-battle-engine", "currentStack", stackArray);
scene.setFlag("csb-battle-engine", "resolvedStacks", historyArray);
scene.setFlag("csb-battle-engine", "lastCombatId", combatId);
```

**Combat Flags** (optional, für schnellen Zugriff):
```javascript
combat.setFlag("csb-battle-engine", "stackState", stackArray);
```

**Actor Flags** (für Action/Bonus Action/Reaction Status):
```javascript
actor.setFlag("csb-battle-engine", "actionUsed", boolean);
actor.setFlag("csb-battle-engine", "bonusActionUsed", boolean);
actor.setFlag("csb-battle-engine", "reactionUsed", boolean);
```

### 6.2 Logging & Audit Trail

**Console Logging:**
```javascript
console.log(`[CSB Battle Engine] Action pushed:`, stackItem);
console.log(`[CSB Battle Engine] Stack resolved:`, resolutionOrder);
```

**Chat Logging:**
- Jede Aktion wird im Chat dokumentiert
- Resolution-Resultat im Chat sichtbar
- Optional: Vollständige Stack-History im Chat ausgeben

### 6.3 Scene Cleanup
- Wenn Scene gewechselt: Stack clearen
- Wenn Combat endet: Option zum Speichern der History
- Alte Stacks nach X Sessions löschen (optional)

---

## 7. UI/UX & Minimalismus

### 7.1 Design-Prinzipien
- **Kein Dialog-Spam:** Nur GM-Dialog, sonst minimal
- **Hotbar-fokussiert:** Spieler interagieren via [R]-Macros
- **Chat-Feedback:** Wichtige Events im Chat (nicht invasiv)
- **GM-Kontrol:** Alle wichtigen Dinge laufen über GM-Dialog

### 7.2 Visual Feedback

**Hotbar Highlighting:**
- Gelbe Border um [R]-Macros
- Pulse-Animation (optional)
- Clear/Obvious (nicht zu subtil)

**Chat Messages:**
- Kurz, prägnant
- Emote/Icons für schnelle Lesbarkeit (z.B. ⚔️ Action, 🛡️ Reaction)
- Nicht zu viel Farbe/Styling

**GM Dialog:**
- Klar strukturiert
- Stack von oben nach unten (Reihenfolge sichtbar)
- Einfache Buttons (Resolve, Edit, Remove)
- Keine unnötigen Informationen

### 7.3 Responsive Design
- Dialog sollte auf mobil nutzbar sein (Tablet)
- Aber Fokus: Desktop/GM

---

## 8. Error Handling & Robustheit

### 8.1 Validierung
```javascript
// Vor jedem Push zu Stack:
- Ist Caster gültig? (Actor existiert)
- Ist Macro gültig? (Macro existiert)
- Ist Target gültig? (Falls vorhanden)
- Ist Action/Reaction logisch? (z.B. nur 1 Action pro Turn)
```

### 8.2 Fehlerbehandlung
```javascript
// Wenn etwas schiefgeht:
- try/catch um alle API-Calls
- User-freundliche Error-Messages im Chat
- Fallback: GM kann manuell korrigieren
- Keine Silent Failures (immer Logging)
```

### 8.3 Netzwerk-Robustheit
- Alle Änderungen via Foundry socket synchronisieren
- Server-Authority (GM) prüft alle Änderungen
- Optimistic UI: Spieler sehen Aktion lokal, Server synct
- Timeout: Falls kein Response vom Server → User-Warning

---

## 9. Konfiguration & Settings

### 9.1 Modul-Einstellungen
```javascript
game.settings.register("csb-battle-engine", "enableAutoChat", {
  name: "Auto-Chat Logging",
  hint: "Automatische Chat-Nachrichten für Aktionen/Reaktionen",
  scope: "world",
  config: true,
  type: Boolean,
  default: true
});

game.settings.register("csb-battle-engine", "reactionHighlightStyle", {
  name: "Reaction Highlighting",
  hint: "Stil für Hervorhebung von [R]-Macros",
  scope: "world",
  config: true,
  type: String,
  choices: {
    "glow": "Glow-Effekt",
    "border": "Einfache Border",
    "opacity": "Transparenz-Änderung"
  },
  default: "glow"
});

game.settings.register("csb-battle-engine", "enableStackHistory", {
  name: "Stack-History speichern",
  hint: "Gespeicherte Stacks für Logging behalten",
  scope: "world",
  config: true,
  type: Boolean,
  default: true
});

game.settings.register("csb-battle-engine", "maxHistoryEntries", {
  name: "Max History Einträge",
  hint: "Wieviele alte Stacks speichern (0 = unbegrenzt)",
  scope: "world",
  config: true,
  type: Number,
  default: 50
});
```

---

## 10. Testing & QA

### 10.1 Manual Test Cases

**Test 1: Einfache Action + Reaction**
- [ ] Spieler castet [A]-Macro
- [ ] GM-Dialog öffnet
- [ ] [R]-Macros werden gelb markiert
- [ ] Spieler klickt [R]-Macro
- [ ] Reaction kommt in Stack
- [ ] GM resolvedt → korrekte Reihenfolge

**Test 2: Bonus Action + Reaction**
- [ ] Spieler castet [B]-Macro
- [ ] GM-Dialog öffnet
- [ ] [R]-Macros werden gelb markiert
- [ ] Spieler reagiert
- [ ] GM resolvedt → Bonus Action first, dann Reaction

**Test 3: Multiple Reactions (Kaskadeneffekt)**
- [ ] Spieler A castet [A]-Action
- [ ] Spieler B reagiert mit [R]-Reaction 1
- [ ] Spieler C reagiert mit [R]-Reaction 2 (auf Reaction 1)
- [ ] GM resolvedt → LIFO-Reihenfolge korrekt

**Test 4: GM Edit/Remove**
- [ ] Stack mit mehreren Items ([A], [B], [R])
- [ ] GM entfernt Item
- [ ] Stack aktualisiert korrekt
- [ ] Resolution funktioniert

**Test 5: Turn-Management**
- [ ] Neue Runde startet
- [ ] Alte Highlights werden entfernt
- [ ] Action/Bonus Action/Reaction Flags resetten

**Test 6: Network Lag Szenario**
- [ ] Spieler mit schlechter Verbindung
- [ ] Socket Messages verzögert
- [ ] System bleibt stabil
- [ ] GM kann korrigieren

### 10.2 Automatisierte Tests (Unit)
```javascript
// Test: Stack-Ordering
assert.deepEqual(
  BattleEngine.resolveStack([action, reaction1, reaction2]),
  [reaction2, reaction1, action],
  "LIFO-Reihenfolge korrekt"
);

// Test: [A] Action Macro Detection
assert.equal(
  BattleEngine.getMacroType("[A] Fireball"),
  "action"
);

// Test: [B] Bonus Action Macro Detection
assert.equal(
  BattleEngine.getMacroType("[B] Quick Heal"),
  "bonus"
);

// Test: [R] Reaction Macro Detection
assert.equal(
  BattleEngine.getMacroType("[R] Counterspell"),
  "reaction"
);

// Test: Actor Flag Setting
assert.equal(
  actor.getFlag("csb-battle-engine", "actionUsed"),
  false
);

assert.equal(
  actor.getFlag("csb-battle-engine", "bonusActionUsed"),
  false
);

assert.equal(
  actor.getFlag("csb-battle-engine", "reactionUsed"),
  false
);
```

---

## 11. Performance & Optimierung

### 11.1 Optimierungen
- Stack nur updaten wenn nötig (nicht bei jedem Hook)
- Reaction-Macro-Liste gecacht (nicht bei jedem Check neu suchen)
- DOM-Manipulationen gebündelt (nicht einzeln)
- Große History-Arrays nach Größe begrenzen

### 11.2 Performance-Monitoring
```javascript
console.time("stack-resolve");
// ... Resolution code ...
console.timeEnd("stack-resolve");
```

---

## 12. Versioning & Kompatibilität

### 12.1 Foundry Kompatibilität
- Minimum Foundry Version: 11.x (oder was du nutzt)
- Kompatibel mit: CSB System
- Nicht kompatibel mit anderen Game Systems (absichtlich)

### 12.2 Versionierung
```javascript
// manifest.json
{
  "name": "csb-battle-engine",
  "title": "CSB Battle Engine",
  "description": "Stack-basiertes Action/Reaction System für CSB",
  "version": "1.0.0",
  "compatibility": {
    "minimum": "11.0",
    "verified": "11.X",
    "maximum": "12"
  },
  "authors": [{ "name": "Your Name" }],
  "url": "https://...",
  "manifest": "https://.../manifest.json",
  "download": "https://.../release.zip"
}
```

---

## 13. Dokumentation & Support

### 13.1 Benutzer-Dokumentation
- README.md: Überblick + Quick Start
- USAGE.md: How to create [R]-Macros
- TROUBLESHOOTING.md: Häufige Probleme

### 13.2 Developer-Dokumentation
- API.md: Alle public functions
- ARCHITECTURE.md: Code-Struktur
- CONTRIBUTING.md: Für künftige Änderungen

---

## 14. Implementierungs-Roadmap

### Phase 1: Core Stack Engine (Woche 1-2)
- Stack Manager
- Data Structures
- Basic Hooks

### Phase 2: UI Components (Woche 2-3)
- GM Dialog
- Hotbar Highlighting
- Chat Integration

### Phase 3: Integration & Polish (Woche 3-4)
- Macro Integration
- Error Handling
- Testing & QA

### Phase 4: Documentation (Woche 4)
- Benutzer-Docs
- Developer-Docs
- Release-Prep

---

## 15. Offene Fragen & Future Work

### 15.1 Future Considerations
- [ ] Undo/Redo für Stack-Änderungen?
- [ ] Macro-Templates für Standard [R]-Macros?
- [ ] Statistische Auswertung (welche Reactions beliebt)?
- [ ] Soundeffekte beim Pushen/Resolvem?
- [ ] Custom Stack-Themes (different colors)?
- [ ] Mobile-optimiert UI?

### 15.2 Feedback-Sammlung
- Nach Release: Spieler-Feedback sammeln
- Iterative Verbesserungen
- Community-Feature-Requests

---

**Ende der Spezifikation**

Kontakt: [Deine Info]  
Letzte Aktualisierung: April 2026