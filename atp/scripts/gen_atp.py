# -*- coding: utf-8 -*-
"""Build the CoreTrace GUI ATP workbook from the Epitech template."""
import sys
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font
from openpyxl.worksheet.table import Table, TableStyleInfo

OUT = Path(__file__).resolve().parent.parent / "CoreTrace-GUI_ATP.xlsx"
# The script rewrites both tabs in full, so the previous workbook works as its own template.
TEMPLATE = sys.argv[1] if len(sys.argv) > 1 else OUT

ACCESS = [
    ("Release under test", "https://github.com/CoreTrace/coretrace-gui/releases/tag/v6.0.0-beta.3 (CoreTrace Desktop v6.0.0-beta.3)"),
    ("Docker test environment", "appendices/docker/ in the appendices ZIP: run ./build.sh then ./run.sh, then open http://localhost:6080/"),
    ("Test data set", "appendices/datasets/ in the appendices ZIP (expected results: datasets/MANIFEST.md)"),
    ("Tester instructions", "appendices/README.md in the appendices ZIP"),
    ("Analyser used for local analysis", "https://github.com/CoreTrace/coretrace/releases/tag/v0.85.0 (ctrace v0.85.0, already installed in the Docker image at /opt/coretrace/bin/ctrace)"),
    ("Source code", "https://github.com/CoreTrace/coretrace-gui"),
    ("Anomaly reports", "https://github.com/CoreTrace/coretrace-gui/issues"),
]

DATASETS = [
    ("DS01 - stack buffer overflow", "DS01_stack_overflow.c",
     "1 warning - StackBufferOverflow on 'buf' (size 16), line 12, index may go up to 32"),
    ("DS02 - clean file", "DS02_clean.c",
     "0 result - 'Aucun problème signalé dans les rapports chargés.'"),
    ("DS03 - out-of-bounds index", "DS03_index_oob.c",
     "2 warnings - StackBufferOverflow on 'tab' (size 10) line 9, UninitializedLocalRead line 10"),
    ("DS04 - unreachable path", "DS04_infeasible_path.c",
     "0 result - the overflow sits on a path the guard makes unreachable (no false positive)"),
    ("DS05 - infinite recursion", "DS05_recursion.c",
     "1 error + 1 note - Recursion.Unconditional and Recursion.Detected, both line 9"),
    ("DS06 - C++ input", "DS06_cpp_array_oob.cpp",
     "2 warnings - StackBufferOverflow on 'tab' (size 8) line 10, UninitializedLocalRead line 12"),
    ("DS07 - unsupported input", "DS07_invalid.txt",
     "0 result, status 'Terminée avec avertissements', the output quotes 'Unsupported input file type'"),
    ("CoreTrace account", "TO BE PROVIDED by the CoreTrace team",
     "Needed for F23 and F24 only. A cloud analysis of the data set returns 24 results and is billed about 3 200 CTU."),
]

GETTING_STARTED = [
    "1. Install Docker (Docker Desktop on macOS and Windows) and start it. Nothing else is needed: the plan runs the same way on Linux, macOS and Windows.",
    "2. Download CoreTrace-GUI_ATP_appendices.zip, delivered alongside this workbook, and unzip it. It contains the Docker environment, the test data set and a README.",
    "3. In a terminal, go to appendices/docker and run ./build.sh (once, about 5 minutes), then ./run.sh. On Windows, use WSL or Git Bash.",
    "4. Open http://localhost:6080/ in a browser: the CoreTrace window appears. The test data set is already mounted at /home/tester/workspace.",
    "5. Open the 'Test Plan' tab of this workbook (tab bar at the bottom of the window) and run the scenarios in order, starting with F1. F1 walks through steps 2 to 4 again. The order matters: later scenarios reuse what earlier ones set up.",
    "6. For each scenario, write PASS or FAIL in the Feedback column, with what you observed for a FAIL.",
    "7. To stop, close the application window or press Ctrl+C in the terminal running run.sh.",
]

CRIT, SEC, UI = "Critical feature", "Secondary function", "User interface"
DONE, WIP = "Done", "In progress"

RUN = "2. Click the red 'Analyser' button above the editor, then 'Sur cette machine'\n3. In the dialog 'Analyser ce fichier local ?', click 'Lancer ctrace'\n4. Wait for the 'Analyses' page to show the result (up to 60 s)"

S = [
("F1", "Launch the application through Docker", CRIT,
 "Bring the test environment up from the published package, with no build step.",
 "Any computer (Linux, macOS or Windows) with Docker installed and running, 3 GB of free disk space, an internet connection. On Windows, run the scripts from WSL or Git Bash.",
 "1. Unzip the appendices archive\n2. cd appendices/docker\n3. Run ./build.sh (about 5 min the first time)\n4. Run ./run.sh\n5. Open http://localhost:6080/ in a browser (it connects on its own)",
 "The build ends with 'Image built: coretrace-gui-atp (CoreTrace Desktop 6.0.0-beta.3)'. The browser shows a window titled 'CoreTrace'. Its left menu lists 'Nouvelle analyse', 'Accueil', 'Analyses', 'Dépôts', 'Espace de code' and 'Paramètres'. The home page reads 'Bonjour. Que souhaitez-vous analyser ?' and the bottom-right corner reads 'Aucun dossier ouvert'.",
 DONE),
("F2", "Installed version and licence", SEC,
 "Check which version is running and under which licence.",
 "The application is running (F1).",
 "1. Click 'Paramètres' in the left menu\n2. Scroll to the bottom of the page, to the 'À propos' panel",
 "The panel reads 'CoreTrace 6.0.0-beta.3' and 'Distribué sous licence Apache 2.0', and offers a 'Licences open source' button.",
 DONE),
("F3", "Open a folder", CRIT,
 "Load the test data set into the code workspace.",
 "The application is running (F1).",
 "1. Click 'Accueil', then the 'Ouvrir un dossier' card\n2. In the folder picker, click 'Home' on the left\n3. Click the 'workspace' folder once, then click 'Open'",
 "The 'Espace de code' page opens with a file tree named 'workspace' listing 8 entries: DS01 to DS07 and MANIFEST.md. The middle of the page reads 'Choisissez un fichier dans l'explorateur, ou Ctrl+P pour le nommer.' with the path /home/tester/workspace under it. The bottom-right corner reads 'workspace'.",
 DONE),
("F4", "Open a file in the editor", CRIT,
 "Display the content of a source file.",
 "The workspace is open (F3).",
 "1. Click DS01_stack_overflow.c in the file tree",
 "A tab named DS01_stack_overflow.c appears and the source code is shown with line numbers and syntax colouring (17 lines). The bar under the editor reads 'c · UTF-8'. Above the editor, 'Enregistrer' is greyed out and a red 'Analyser' button is available.",
 DONE),
("F5", "Edit and save a file", CRIT,
 "Persist an edit to disk.",
 "The workspace is open (F3).",
 "1. Click DS02_clean.c in the file tree\n2. Click at the end of the last line and type: // atp\n3. Click 'Enregistrer' above the editor\n4. Close the DS02_clean.c tab with its x, then click DS02_clean.c in the tree again",
 "After step 2 the 'Enregistrer' button becomes active. After step 3 it is greyed out again. After step 4 the reopened file still contains the typed comment.",
 DONE),
("F6", "Unsaved changes are protected", SEC,
 "Do not lose or silently discard an edit that was not saved.",
 "DS01_stack_overflow.c and DS02_clean.c are open in two tabs (F4, F5).",
 "1. In DS02_clean.c, type a few characters and do not save\n2. Click the DS01_stack_overflow.c tab, then the DS02_clean.c tab again\n3. Click the x of the DS02_clean.c tab\n4. Click 'Annuler'\n5. Click the x again, then 'Abandonner'\n6. Click DS02_clean.c in the tree",
 "After step 2 the unsaved characters are still in the editor. Step 3 opens a dialog 'Abandonner les modifications ?' stating that DS02_clean.c contains unsaved changes. 'Annuler' keeps the tab and its text; 'Abandonner' closes it. The file reopened in step 6 shows the last saved content, without the unsaved characters.",
 DONE),
("F7", "Refresh the file tree", SEC,
 "Show a file created outside the application.",
 "The workspace is open (F3).",
 "1. On your own computer, create an empty file named notes.txt in the appendices/datasets folder\n2. In the application, click the refresh icon to the right of 'workspace' at the top of the file tree",
 "notes.txt appears in the file tree after the refresh. The open tabs are unchanged.",
 DONE),
("F8", "Local analysis asks for an analyser first", SEC,
 "Fail with a usable message when no analyser has been chosen.",
 "The container was just started: no ctrace has been selected yet. DS01_stack_overflow.c is open.",
 "1. Click the red 'Analyser' button above the editor\n2. Read the two entries of the menu\n3. Click 'Sur cette machine'",
 "The menu offers 'Sur cette machine' and a greyed-out 'Dans le cloud' with 'Connectez-vous pour analyser dans le cloud'. Step 3 runs nothing: the application switches to 'Paramètres' and shows the message 'Sélectionnez le programme ctrace avant de lancer une analyse locale.'",
 DONE),
("F9", "Select the local analyser", CRIT,
 "Point the application at the ctrace program installed on the machine.",
 "The application is running. The Docker image provides ctrace at /opt/coretrace/bin/ctrace.",
 "1. Click 'Paramètres', panel 'Analyseur local'\n2. Click 'Choisir ctrace'\n3. In the file picker, type /opt/coretrace/bin/ctrace (typing the first / opens the path field) and press Enter. Alternatively browse: Other Locations > Computer > opt > coretrace > bin > ctrace, then 'Open'",
 "The panel shows /opt/coretrace/bin/ctrace instead of 'Aucun exécutable sélectionné'. 'Configuration des outils' is filled automatically with /opt/coretrace/config/tool-config.json. The tool line lists cppcheck, tscancode, ikos and flawfinder each with a cross, followed by 'les outils absents ne produisent aucun résultat': those optional tools are not installed in the image, and the application says so before any run.",
 DONE),
("F10", "Analyse a file with a known overflow", CRIT,
 "Verify the core feature: reporting a real stack buffer overflow.",
 "ctrace is selected (F9) and the workspace is open (F3).",
 "1. In 'Espace de code', open DS01_stack_overflow.c\n" + RUN,
 "The 'Analyses' page shows 'Dernière analyse locale' with the status 'Terminée' and 'Résultats 1'. Under 'AVERTISSEMENTS · 1' one entry marked W reads /home/tester/workspace/DS01_stack_overflow.c:12, rule StackBufferOverflow. Its message names the variable 'buf' (size 16) and states that the index may go up to 32 while the last valid index is 15, on a write access. The list 'Sur cette machine' gains a line DS01_stack_overflow.c tagged 'Terminée' and 'local'.",
 DONE),
("F11", "Analyse a clean file", CRIT,
 "Verify the tool stays silent on correct code.",
 "ctrace is selected (F9) and the workspace is open.",
 "1. In 'Espace de code', open DS02_clean.c\n" + RUN,
 "The status is 'Terminée', the page shows 'Résultats 0' and 'Aucun problème signalé dans les rapports chargés.' No warning or error entry is listed.",
 DONE),
("F12", "Several findings of different rules", CRIT,
 "Check a file with more than one defect.",
 "ctrace is selected (F9) and the workspace is open.",
 "1. In 'Espace de code', open DS03_index_oob.c\n" + RUN,
 "The page shows 'Résultats 2' under 'AVERTISSEMENTS · 2': StackBufferOverflow at DS03_index_oob.c:9 on 'tab' (size 10), and UninitializedLocalRead at DS03_index_oob.c:10.",
 DONE),
("F13", "No false positive on an unreachable path", CRIT,
 "Check that a defect that cannot be reached is not reported.",
 "ctrace is selected (F9) and the workspace is open.",
 "1. In 'Espace de code', open DS04_infeasible_path.c and read the code: the write buf[i] is guarded by n < 8 then n > 16\n" + RUN,
 "The status is 'Terminée' and the page shows 'Résultats 0': no StackBufferOverflow is reported, even though the write is syntactically out of bounds.",
 DONE),
("F14", "Report an error-level defect", CRIT,
 "Check the highest severity is produced and displayed as such.",
 "ctrace is selected (F9) and the workspace is open.",
 "1. In 'Espace de code', open DS05_recursion.c\n" + RUN,
 "The page shows 'Résultats 2', split in two groups. 'ERREURS · 1': an entry marked E at DS05_recursion.c:9, rule Recursion.Unconditional, 'unconditional self recursion detected (no base case)'. 'NOTES · 1': an entry marked N at DS05_recursion.c:9, rule Recursion.Detected. The status badge reads 'Échouée' because ctrace exits with an error code when it finds an error-level defect; the findings are displayed all the same.",
 DONE),
("F15", "Analyse a C++ file", CRIT,
 "Check .cpp inputs are supported, not only C.",
 "ctrace is selected (F9) and the workspace is open.",
 "1. In 'Espace de code', open DS06_cpp_array_oob.cpp\n" + RUN,
 "The page shows 'Résultats 2' under 'AVERTISSEMENTS · 2': StackBufferOverflow at DS06_cpp_array_oob.cpp:10 on 'tab' (size 8), and UninitializedLocalRead at DS06_cpp_array_oob.cpp:12.",
 DONE),
("F16", "Unsupported input file", CRIT,
 "Never present a file that could not be analysed as clean.",
 "ctrace is selected (F9) and the workspace is open.",
 "1. In 'Espace de code', open DS07_invalid.txt\n" + RUN + "\n5. Click 'Sortie de ctrace' to unfold the raw output",
 "The status reads 'Terminée avec avertissements' and a banner states 'Un ou plusieurs outils n'ont pas pu terminer l'analyse.' The page shows 'Résultats 0'. The unfolded output quotes the analyser: 'Unsupported input file type' and 'Failed to analyze'. The application does not hang and stays usable.",
 DONE),
("F17", "Jump from a finding to the code", CRIT,
 "Navigate from a result to the offending line.",
 "ctrace is selected (F9) and the workspace is open.",
 "1. Run the analysis on DS01_stack_overflow.c again (F10)\n2. On the 'Analyses' page, click the location /home/tester/workspace/DS01_stack_overflow.c:12 of the finding",
 "The application switches to 'Espace de code', shows DS01_stack_overflow.c and places the cursor on line 12 (buf[i] = src[i];), which is highlighted as the current line.",
 DONE),
("F18", "Analyse the whole folder", CRIT,
 "Analyse every source file of the open folder in one run.",
 "ctrace is selected (F9) and the workspace is open.",
 "1. Click 'Nouvelle analyse' at the top of the left menu\n2. Read the dialog 'Analyser workspace ?'\n3. Click 'Analyser workspace'\n4. Wait for the result (up to 2 min)",
 "The dialog names the open folder (/home/tester/workspace). The run reports '6 fichier(s) analysé(s) sur 6' (DS01 to DS06; the .txt and .md files are not source files). The findings of all six files are listed together: 7 results, namely the ones of F10, F12, F14 and F15. Known anomaly in v6.0.0-beta.3: the page shows 'Résultats 0' although the unfolded 'Sortie de ctrace' contains the findings; corrected in the source code after this release. Report what you observe.",
 WIP),
("F19", "Sign-in dialog", SEC,
 "Start the connection to a CoreTrace account with a device code.",
 "The application is running with an internet connection. No account is needed for this scenario.",
 "1. Click 'Se connecter' at the bottom of the left menu\n2. Read the dialog\n3. Close it with its x",
 "A dialog 'Connexion à CoreTrace' shows a code of the form XXXX-XXXX, 'Code valable 10 minutes', a button 'Ouvrir la connexion', the address https://app.coretrace.fr/v1/auth/device/verify?user_code=<code> and 'En attente de validation…'. After closing it the application is still signed out: the bottom of the left menu still reads 'Se connecter'.",
 DONE),
("F20", "Clone a GitHub repository", CRIT,
 "Fetch a public repository and open it next to the local folder.",
 "The application is running with an internet connection and the workspace is open (F3).",
 "1. Click 'Dépôts' in the left menu\n2. Click 'Cloner un dépôt'\n3. In the field 'Dépôt GitHub', type octocat/Hello-World\n4. Click 'Cloner'",
 "Without an account the 'Dépôts' page reads 'Connectez votre compte CoreTrace' and states that manual cloning stays available. After step 4 the application switches to 'Espace de code': a second folder 'Hello-World' appears under 'workspace' in the file tree and contains README, the folder selector at the top reads 'Hello-World', and the page shows the path /home/tester/.local/share/fr.coretrace.desktop/repositories/octocat/Hello-World.",
 DONE),
("F21", "Keyboard shortcuts: save and quick open", UI,
 "Save a file and open another one without the mouse.",
 "The workspace is open (F3). Click once inside the application so the keyboard goes to it. If your browser keeps a shortcut for itself, open the noVNC panel on the left edge of the page, click 'Show extra keys', click 'Ctrl', press the letter, then click 'Ctrl' again.",
 "1. Click DS04_infeasible_path.c in the file tree\n2. Click at the end of the last line and type: // key\n3. Press Ctrl+S\n4. Press Ctrl+P\n5. Type DS01 and press Enter",
 "After step 2 the 'Enregistrer' button is active. After step 3 it is greyed out again without having been clicked. After step 4 a dialog 'Ouvrir un fichier' opens with a field 'Nom ou chemin…' and lists the files of the folder. After step 5 the dialog closes and DS01_stack_overflow.c is open in the editor.",
 DONE),
("F22", "Search in a file", UI,
 "Find a word in the open file.",
 "The workspace is open (F3). Same keyboard advice as F21.",
 "1. Click DS01_stack_overflow.c in the file tree\n2. Click inside the editor\n3. Press Ctrl+F\n4. Type buf",
 "A search box opens at the top right of the editor, every occurrence of 'buf' is highlighted and the box shows the number of matches. Known anomaly in v6.0.0-beta.3: no search box opens, although the editor's start page advertises 'Ctrl/Cmd + F : rechercher'; corrected in the source code after this release. Report what you observe.",
 WIP),
("F23", "Sign in to CoreTrace", CRIT,
 "Connect the application to a CoreTrace account.",
 "The application is running with an internet connection. A CoreTrace account (see 'CoreTrace account' in the Info & Access tab).",
 "1. Click 'Se connecter' at the bottom of the left menu\n2. In your own browser (not in the noVNC page), open the address shown in the dialog\n3. Sign in with the CoreTrace account and approve the code\n4. Come back to the application and click 'Accueil'",
 "The dialog closes on its own once the code is approved, with no error message. The bottom of the left menu shows the account's e-mail address and its organisation instead of 'Se connecter'. The 'Accueil' page shows 'Votre organisation' with three figures: 'CTU disponibles', 'Consommation de la période' and 'Plan actuel'. 'Analyses' in the left menu shows a counter.",
 DONE),
("F24", "Analyse the folder in the cloud", CRIT,
 "Run the analysis on the CoreTrace platform and read its result in the application.",
 "Signed in (F23) and the workspace is open (F3). The run is billed to the account: about 3 200 CTU.",
 "1. Click DS01_stack_overflow.c in the file tree\n2. Click the red 'Analyser' button above the editor, then 'Dans le cloud'\n3. Wait for the quote at the bottom right (up to 30 s) and click 'Lancer l'analyse'\n4. Wait for 'Analyse terminée' (up to 2 min) and click 'Voir les résultats'",
 "After step 2 the bottom bar reads 'Vérification par la plateforme'. After step 3 a box reads '<n> CTU seront débités' and 'Rien n'a encore été débité pour cette analyse.', with the buttons 'Lancer l'analyse' and 'Refuser'; once launched the bottom bar reads 'Analyse en cours dans le cloud'. After step 4 a page titled 'workspace' carries the badge 'Problèmes détectés', the line '<n> CTU facturés · <n> s · 3 / 3 outils terminés' and 'Résultats 24'. Under 'ERREURS · 6' the first finding is DS01_stack_overflow.c:12, rule arrayIndexOutOfBounds, tagged 'cloud': \"Array 'buf[16]' accessed at index 32, which is out of bounds.\" The billed amount is not higher than the quote. The counter next to 'Analyses' in the left menu has grown by one.",
 DONE),
]

wb = openpyxl.load_workbook(TEMPLATE)

# ---------------------------------------------------------------- Info & Access
info = wb["Info & Access"]
# earlier runs leave merged cells in the workbook reused as template
for rng in list(info.merged_cells.ranges):
    info.unmerge_cells(str(rng))
for row in info.iter_rows(min_row=1, max_row=info.max_row + 5, max_col=4):
    for c in row:
        c.value = None
info.tables.clear()

info["A1"] = "Getting started"
info["A1"].font = Font(bold=True, size=12)
for i, line in enumerate(GETTING_STARTED):
    info.cell(row=2 + i, column=1, value=line)
    info.merge_cells(start_row=2 + i, start_column=1, end_row=2 + i, end_column=3)

acc = 3 + len(GETTING_STARTED)
info.cell(row=acc, column=1, value="Access to testing platforms").font = Font(bold=True, size=12)
info.cell(row=acc + 1, column=1, value="Acess point")
info.cell(row=acc + 1, column=2, value="URL")
r = acc + 2
for name, url in ACCESS:
    info.cell(row=r, column=1, value=name)
    info.cell(row=r, column=2, value=url)
    r += 1
access_end = r - 1

ds_label = access_end + 2
info.cell(row=ds_label, column=1, value="Data sets").font = Font(bold=True, size=12)
hdr = ds_label + 1
info.cell(row=hdr, column=1, value="Data set")
info.cell(row=hdr, column=2, value="File (appendices/datasets/)")
info.cell(row=hdr, column=3, value="Expected result")
r = hdr + 1
for a, b, c in DATASETS:
    info.cell(row=r, column=1, value=a)
    info.cell(row=r, column=2, value=b)
    info.cell(row=r, column=3, value=c)
    r += 1
ds_end = r - 1

note = ds_end + 2
info.cell(row=note, column=1, value="Notes").font = Font(bold=True, size=12)
NOTES = [
    "Version under test: CoreTrace Desktop v6.0.0-beta.3, installed from its published Linux package. The interface is in French; the plan quotes its labels as displayed.",
    "The whole plan runs in the Docker image in appendices/docker, on any computer with Docker (Linux, macOS, Windows). No scenario depends on the tester's operating system.",
    "Local analysis uses ctrace v0.85.0, installed in the image at /opt/coretrace/bin/ctrace, with clang 20. Do not use ctrace v0.74.0: the application cannot read the report that version writes ('Format de rapport non reconnu').",
    "Only the stack analyser built into ctrace runs. cppcheck, tscancode, ikos and flawfinder are not installed in the image; the application lists them as missing (scenario F9).",
    "F23 and F24 need a CoreTrace account and spend its CTU; every other scenario runs without an account. Out of scope: connected repositories, organisation dashboards and automatic updates.",
    "A scenario is validated when every expected result is obtained with no blocking or critical anomaly. Report anything else in the Feedback column of the test plan.",
]
for i, line in enumerate(NOTES):
    info.cell(row=note + 1 + i, column=1, value=line)

t1 = Table(displayName="AccessPoints", ref="A%d:B%d" % (acc + 1, access_end))
t1.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
info.add_table(t1)
t2 = Table(displayName="DataSets", ref="A%d:C%d" % (hdr, ds_end))
t2.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
info.add_table(t2)

info.column_dimensions["A"].width = 34
info.column_dimensions["B"].width = 62
info.column_dimensions["C"].width = 80
for row in info.iter_rows(min_row=1, max_row=info.max_row, max_col=3):
    for c in row:
        c.alignment = Alignment(vertical="top", wrap_text=True)

# ------------------------------------------------------------------- Test Plan
tp = wb["Test Plan"]
tbl = tp.tables["Tableau7"]
for row in tp.iter_rows(min_row=2, max_row=tp.max_row, max_col=9):
    for c in row:
        c.value = None
for i, sc in enumerate(S):
    for j, val in enumerate(sc):
        tp.cell(row=2 + i, column=1 + j, value=val)
last = 1 + len(S)
tbl.ref = "A1:I%d" % last
tbl.autoFilter.ref = tbl.ref

for row in tp.iter_rows(min_row=1, max_row=last, max_col=9):
    for c in row:
        c.alignment = Alignment(vertical="top", wrap_text=True)
for col, w in zip("ABCDEFGHI", [10, 34, 19, 44, 40, 52, 78, 18, 34]):
    tp.column_dimensions[col].width = w
tp.freeze_panes = "C2"

wb.save(OUT)
print("written:", OUT)
print("scenarios:", len(S), "| access rows:", len(ACCESS), "| datasets:", len(DATASETS))
