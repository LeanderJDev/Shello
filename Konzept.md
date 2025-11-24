# Chat als Terminal

## Übersicht

Rechnernetze Projekt
Frontend mit React
-> Websocket zum Backend
Backend mit flask
-> Websocket zum Frontend
-> REST API zur Datenbank

## Funktionen

-   Mehrere Benutzer mit eigenen Identitäten
-   Benutzer können Gruppen beitreten und verlassen
-   Nachrichten werden als aktueller Benutzer gesendet
-   Empfangene Nachrichten im aktuellen Chat anzeigen
-   Terminal-ähnliche Oberfläche mit Eingabefeld und Befehlssatz
-   Befehlshistorie
-   Autovervollständigung für Befehle und Argumente

## Befehle

forge <Benutzer> - Erstelle einen neuen Benutzer

impersonate <Benutzer> - Wechsle zu dem angegebenen Benutzer.

sc <Benutzer/Gruppe> - Wechsle zu angegebenem Benutzer oder Gruppe.
-> permission denied when not member of group
-> list available options when Tab is pressed
-> switch to own chat when no argument is given

lc - Liste alle verfügbaren Benutzer und Gruppen auf.

accede <Gruppe> - Trete der angegebenen Gruppe bei.

secede <Gruppe> - Verlasse die angegebene Gruppe.

send <Nachricht> - Sende eine Nachricht als aktueller Benutzer.

whoami - Zeige den aktuellen Benutzer an.

exit - Beende die Terminal-Sitzung.

help - Zeige diese Hilfemeldung an.

clear - Entferne alle Nachrichten aus dem Terminal.

theme -c <Farbe> -f <Schriftart> - Passe die Farben und Schriftarten des Terminals an.

theme save <Themenname> - Speichere aktuelles Theme

theme load <Themenname> - Lade gespeichertes Theme

## Komponenten

Input: Eingabefeld

SendButton: Button zum Senden der Nachricht

ErrorPopup: Popup zur Anzeige von Fehlern

InputBar: Leiste am unteren Rand

MessageText: Einzelne Chat-Nachricht
-> optional Benutzername (eingefärbt nach Hash des Usernames)
-> Zeitstempel

ScrollView: Anzeige der Chat-Nachrichten

## Projektname

ShellChat
TerminalText
Terminally
TermTalker
TermiTalk II
ttyChat I
Shello III
QuatschKonsole
send
Shellschreiber
EchoPrompt
