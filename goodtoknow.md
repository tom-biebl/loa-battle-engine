Hook	Wann	Was
ready	Page-Load / Refresh	loadFromCombat() — stellt Stack + Participants aus Flags wieder her
createCombat	Neuer Encounter	initParticipants() — alle Ressourcen auf true
updateCombat	Rundenänderung	initParticipants() — Ressourcen resetten
engine wird in init erstellt weil das der früheste Hook ist — ready und alle späteren Hooks können sicher darauf zugreifen.