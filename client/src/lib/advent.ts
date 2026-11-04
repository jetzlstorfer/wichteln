export interface AdventDoor {
  day: number;
  emoji: string;
  title: string;
  text: string;
}

/** A small Austrian tradition, recipe idea or family task for every day in Advent. */
export const ADVENT_DOORS: AdventDoor[] = [
  { day: 1, emoji: '🕯️', title: 'Los geht’s!', text: 'Ab heute zählen wir die Tage bis zum Heiligen Abend. Wer mag, stellt heute den Adventkranz auf den Tisch – mit vier Kerzen, für jeden Adventsonntag eine.' },
  { day: 2, emoji: '🍪', title: 'Kekserl-Zeit', text: 'Vanillekipferl, Linzer Augen, Kokosbusserl: Sucht euch heute gemeinsam aus, welche Weihnachtskekse ihr heuer backen wollt. Das Christkind nascht auch gern.' },
  { day: 3, emoji: '☕', title: 'Am Adventmarkt', text: 'Ein Becher Punsch, heiße Maroni und Bratapfelduft – ein Spaziergang über den Adventmarkt ist der perfekte Moment, um heimlich Geschenkideen zu sammeln.' },
  { day: 4, emoji: '🌸', title: 'Barbarazweige', text: 'Heute ist Barbaratag! Schneidet einen Kirsch- oder Forsythienzweig und stellt ihn ins Wasser. Blüht er zu Weihnachten, bringt das Glück fürs neue Jahr.' },
  { day: 5, emoji: '😈', title: 'Krampustag', text: 'Heute ziehen in vielen Orten die Krampusse mit Glocken durch die Straßen. Gut, dass du brav warst – oder? Morgen kommt ja schon der Nikolo.' },
  { day: 6, emoji: '🍊', title: 'Der Nikolo war da', text: 'Nüsse, Mandarinen, Lebkuchen und ein Schokonikolo im Stiefel: Der heilige Nikolaus beschenkt heute die Kinder. Habt ihr eure Schuhe auch geputzt?' },
  { day: 7, emoji: '⭐', title: 'Strohsterne basteln', text: 'Ein paar Strohhalme, ein roter Faden und etwas Geduld – fertig ist der klassische Strohstern für den Christbaum. Wer bastelt den schönsten?' },
  { day: 8, emoji: '🎶', title: 'Feiertag', text: 'Heute ist Maria Empfängnis – in Österreich ein Feiertag. Zeit für einen gemütlichen Tag mit Kerzenlicht, Tee und den ersten Weihnachtsliedern.' },
  { day: 9, emoji: '🏠', title: 'Lebkuchenhaus', text: 'Mit Zuckerguss als Kleber und Zuckerln als Dachziegeln wird aus Lebkuchen ein kleines Hexenhäuschen. Aufpassen, dass niemand vorher das Dach aufisst!' },
  { day: 10, emoji: '🕯️', title: 'Rorate', text: 'Bei den Roratemessen wird früh am Morgen nur bei Kerzenschein gefeiert. Ein schöner Gedanke für heute: ein bisschen Licht in die dunkle Jahreszeit bringen.' },
  { day: 11, emoji: '📮', title: 'Post ans Christkind', text: 'Im Ort Christkindl bei Steyr gibt es ein eigenes Weihnachtspostamt. Briefe von dort bekommen einen besonderen Stempel – vielleicht schreibst du heute auch eine Karte?' },
  { day: 12, emoji: '🙏', title: 'Herbergsuche', text: 'Beim „Frauentragen“ wandert in manchen Gegenden ein Marienbild von Haus zu Haus und findet jeden Abend eine neue Herberge. Wem könntest du heute eine Freude machen?' },
  { day: 13, emoji: '🌾', title: 'Luzienweizen', text: 'Am Luzientag sät man Weizenkörner in eine flache Schale. Bis Weihnachten wachsen daraus grüne Halme – ein Zeichen für neues Leben und ein gutes Jahr.' },
  { day: 14, emoji: '🧣', title: 'Winterspaziergang', text: 'Haube auf, Handschuhe an: Ein Spaziergang in der Dämmerung, wenn überall die Fenster leuchten, ist die schönste Adventstimmung. Mit Glück schneit es sogar!' },
  { day: 15, emoji: '🍵', title: 'Kinderpunsch', text: 'Früchtetee, Orangen- und Apfelsaft, eine Zimtstange und ein paar Nelken – langsam erwärmen und schon duftet das ganze Haus nach Weihnachten.' },
  { day: 16, emoji: '🎵', title: 'Anklöpfeln', text: 'In Tirol ziehen im Advent Sängerinnen und Sänger von Haus zu Haus, klopfen an und singen von der Herbergsuche. Welches Weihnachtslied singt ihr am liebsten?' },
  { day: 17, emoji: '🎁', title: 'Packerl-Check', text: 'Wie weit bist du mit deinem Wichtelgeschenk? Noch eine Woche bis zum Heiligen Abend – das Christkind hat die Liste schon zweimal überprüft.' },
  { day: 18, emoji: '✉️', title: 'Der Wunschzettel', text: 'In Österreich legen Kinder ihren Brief ans Christkind aufs Fensterbrett. Ist er am nächsten Morgen weg, hat ihn das Christkind abgeholt. Steht auf deinem schon alles drauf?' },
  { day: 19, emoji: '🕯️', title: 'Bienenwachs', text: 'Selbst gerollte Kerzen aus Bienenwachsplatten sind schnell gemacht, duften herrlich nach Honig und sind ein liebes kleines Mitbringsel.' },
  { day: 20, emoji: '🐑', title: 'Krippenschauen', text: 'Ochs, Esel, Hirten und Schafe: In vielen Kirchen und Häusern werden jetzt prachtvolle Krippen aufgebaut. In Tirol ist das „Krippeleschaugn“ eine eigene Tradition.' },
  { day: 21, emoji: '🌙', title: 'Die längste Nacht', text: 'Rund um den 21. Dezember ist die längste Nacht des Jahres. Ab jetzt werden die Tage wieder länger – das Licht kommt zurück!' },
  { day: 22, emoji: '🎀', title: 'Einpacken!', text: 'Geschenkpapier, Masche, Namensschild: Heute ist ein guter Tag, um dein Wichtel-Packerl liebevoll einzupacken. Psst – nicht verraten, für wen es ist!' },
  { day: 23, emoji: '🌲', title: 'Der Christbaum', text: 'Bei vielen Familien bringt das Christkind am Heiligen Abend auch den geschmückten Christbaum. Heute wird noch geputzt, gekocht und alles schön hergerichtet.' },
  { day: 24, emoji: '🔔', title: 'Heiliger Abend', text: 'Wenn das Glöckchen klingelt, war das Christkind da! „Stille Nacht“ wurde übrigens 1818 in Oberndorf bei Salzburg zum ersten Mal gesungen. Frohe Weihnachten! ✨' },
];
