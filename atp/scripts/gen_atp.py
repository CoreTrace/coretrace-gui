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

REL = "https://github.com/CoreTrace/coretrace-gui/releases/download/v5.1.0"

ACCESS = [
    ("Release under test", "https://github.com/CoreTrace/coretrace-gui/releases/tag/v5.1.0 (v5.1.0)"),
    ("Docker test environment", "appendices/docker/ in the appendices ZIP: run ./build.sh then ./run.sh, then open http://localhost:6080/"),
    ("Test data set", "appendices/datasets/ in the appendices ZIP (expected results: datasets/MANIFEST.md)"),
    ("Tester instructions", "appendices/README.md in the appendices ZIP"),
    ("Source code", "https://github.com/CoreTrace/coretrace-gui"),
    ("API documentation", "https://coretrace.github.io/coretrace-gui/"),
    ("Anomaly reports", "https://github.com/CoreTrace/coretrace-gui/issues"),
]

DATASETS = [
    ("DS01 - stack buffer overflow", "DS01_stack_overflow.c",
     "1 WARNING - StackBufferOverflow on 'buf' (size 16), line 12, index may go up to 32"),
    ("DS02 - clean file", "DS02_clean.c",
     "0 diagnostic - the analysis succeeds and the empty-results state is shown"),
    ("DS03 - out-of-bounds index", "DS03_index_oob.c",
     "2 WARNINGs - StackBufferOverflow on 'tab' (size 10) line 9, UninitializedLocalRead (CWE-457) line 10"),
    ("DS04 - unreachable path", "DS04_infeasible_path.c",
     "0 diagnostic - the overflow sits on a path the guard makes unreachable (no false positive)"),
    ("DS05 - infinite recursion", "DS05_recursion.c",
     "1 INFO + 1 ERROR - recursive function detected, then unconditional self recursion (no base case), line 9"),
    ("DS06 - C++ input", "DS06_cpp_array_oob.cpp",
     "2 WARNINGs - StackBufferOverflow on 'tab' (size 8) line 10, UninitializedLocalRead line 12"),
    ("DS07 - unsupported input", "DS07_invalid.txt",
     "The analysis fails and the panel reports the error (Unsupported input file type)"),
    ("DS08 - large source file", "DS08_large_file.c",
     "About 2 MB: the editor shows the first 1 MB and a 'Load next 1 MB' button"),
    ("AI assistant credentials", "not provided",
     "The tester supplies their own API key (OpenAI, Anthropic, Groq, Deepseek or Perplexity) or a local .gguf model file"),
]

GETTING_STARTED = [
    "1. Install Docker (Docker Desktop on macOS and Windows) and start it. Nothing else is needed: the plan runs the same way on Linux, macOS and Windows.",
    "2. Download CoreTrace-GUI_ATP_appendices.zip, delivered alongside this workbook, and unzip it. It contains the Docker environment, the test data set and a README.",
    "3. In a terminal, go to appendices/docker and run ./build.sh (once, about 5 minutes), then ./run.sh. On Windows, use WSL or Git Bash.",
    "4. Open http://localhost:6080/ in a browser: the CoreTrace GUI window appears. The test data set is already mounted at /home/tester/workspace.",
    "5. Open the 'Test Plan' tab of this workbook (tab bar at the bottom of the window) and run the scenarios in order, starting with F1. F1 walks through steps 2 to 4 again.",
    "6. For each scenario, write PASS or FAIL in the Feedback column, with what you observed for a FAIL.",
    "7. To stop, close the application window or press Ctrl+C in the terminal running run.sh.",
]

CRIT, SEC, UI = "Critical feature", "Secondary function", "User interface"
DONE, WIP = "Done", "In progress"

S = [
("F1", "Launch the application through Docker", CRIT,
 "Bring the reference test environment up from the published binary, with no build step.",
 "Any computer (Linux, macOS or Windows) with Docker installed and running, 3 GB of free disk space, an internet connection. On Windows, run the scripts from WSL or Git Bash.",
 "1. Unzip the appendices archive\n2. cd appendices/docker\n3. Run ./build.sh (downloads the 506 MB AppImage, about 5 min)\n4. Run ./run.sh\n5. Open http://localhost:6080/ in a browser (it connects on its own)",
 "The build ends with 'Image built: coretrace-gui-atp'. The browser shows the CoreTrace GUI window: custom title bar, activity bar on the left, Explorer sidebar, and a welcome screen in the middle. The status bar bottom-right reads 'ctrace-gui v5.1.0'.",
 DONE),
("F2", "Open a folder as a workspace", CRIT,
 "Load the test data set into the file explorer.",
 "The application is running; the datasets folder is reachable (in Docker it is mounted at /home/tester/workspace).",
 "1. Menu File > Open Folder...\n2. Select the datasets folder (/home/tester/workspace in Docker)\n3. Confirm",
 "The sidebar switches from 'No folder opened' to the workspace root named after the folder, and lists the 9 data set entries (DS01 to DS08 plus MANIFEST.md) sorted with folders first. The Explorer icon in the activity bar stays highlighted.",
 DONE),
("F3", "Open a file in the editor", CRIT,
 "Display the content of a source file.",
 "The datasets workspace is open (F2).",
 "1. Click DS01_stack_overflow.c in the file tree",
 "A tab named DS01_stack_overflow.c appears above the editor, the welcome screen is replaced by the source code with line numbers, and the status bar shows 'Ln 1, Col 1', 'UTF-8' and a C/C++ file type.",
 DONE),
("F4", "Create a file", CRIT,
 "Create a new source file inside the workspace.",
 "The datasets workspace is open.",
 "1. Right-click an empty area of the file tree\n2. Choose 'New file..'\n3. Type test_atp.c and confirm",
 "test_atp.c appears in the tree, opens in an empty editor tab, and exists on disk (visible from the integrated terminal with ls).",
 DONE),
("F5", "Save a modified file", CRIT,
 "Persist an edit to disk.",
 "DS02_clean.c is open in the editor.",
 "1. Type a comment line at the top of DS02_clean.c\n2. Menu File > Save\n3. Close the tab and reopen the file",
 "The tab loses its unsaved-changes marker on save, a confirmation notification appears, and reopening the file shows the added comment.",
 DONE),
("F6", "Partial loading of a large file", SEC,
 "Keep the editor responsive on a file larger than 1 MB.",
 "The datasets workspace is open.",
 "1. Open DS08_large_file.c (about 2 MB)\n2. Read the banner shown under the editor\n3. Click 'Load next 1 MB'",
 "The file opens without freezing the interface, a banner reads 'Showing first 1 MB' with a 'Load next 1 MB' button, and clicking it appends the following megabyte to the editor content.",
 DONE),
("F7", "File deleted while open", SEC,
 "Fail safely when the file backing a tab disappears.",
 "test_atp.c is open in a tab (F4).",
 "1. In the integrated terminal, run: rm test_atp.c\n2. Look at the editor\n3. Open 'Ctrace Tools' and click 'Run Analysis'",
 "A banner reads 'File not found on disk.' with a 'Close tab' button. The analysis is refused with 'File not found - analysis blocked' instead of running on a missing file. The application does not crash.",
 DONE),
("F8", "Search across the workspace", CRIT,
 "Find a symbol in every file of the project.",
 "The datasets workspace is open.",
 "1. Click the Search icon in the activity bar\n2. Type StackBufferOverflow in the search field and confirm\n3. Click one of the results",
 "The panel lists the matching files with the matching lines (MANIFEST.md at least). Clicking a result opens that file in a tab, scrolled to the matching line.",
 DONE),
("F9", "Analysis toolchain check", CRIT,
 "Prove the analyser can actually compile before trusting any analysis result.",
 "The datasets workspace is open. The Docker image (F1) already contains clang 20.",
 "1. Open the integrated terminal (View > Terminal)\n2. Run: clang --version\n3. Open DS05_recursion.c in the active tab\n4. Open 'Ctrace Tools' and click 'Run Analysis' with the default arguments",
 "Step 2 reports version 20.x. Step 4 reports 1 error and 1 info. If step 4 reports zero diagnostics, the toolchain is wrong and every later analysis scenario is meaningless: the analyser returns 'no diagnostics' rather than an error when it cannot compile. Stop and fix clang before running F10 to F18, and record the clang version in the Feedback column.",
 DONE),
("F10", "Analyse a file with a known overflow", CRIT,
 "Verify the core feature: reporting a real stack buffer overflow.",
 "The datasets workspace is open, DS01_stack_overflow.c open in the active tab.",
 "1. Menu 'Ctrace Tools'\n2. Leave the arguments field at its default value: --invoke=ctrace_stack_analyzer --sarif-format\n3. Click 'Run Analysis'\n4. Wait for the spinner to disappear (up to 60 s)",
 "The panel shows exactly 1 diagnostic, of severity WARNING, rule StackBufferOverflow, located at line 12 of DS01_stack_overflow.c. Its message names the variable 'buf' (size 16) and states that the index may go up to 32 while the last valid index is 15, on a write access.",
 DONE),
("F11", "Analyse a clean file", CRIT,
 "Verify the tool stays silent on correct code.",
 "The datasets workspace is open.",
 "1. Open DS02_clean.c in the active tab\n2. Open 'Ctrace Tools' and click 'Run Analysis' with the default arguments",
 "The analysis completes without error and the panel reports zero diagnostic (empty-results state). No warning or error entry is listed.",
 DONE),
("F12", "Several diagnostics of different rules", CRIT,
 "Check grouping and counting when a file has more than one defect.",
 "The datasets workspace is open.",
 "1. Open DS03_index_oob.c in the active tab\n2. Run the analysis with the default arguments",
 "The panel reports 2 WARNINGs, grouped by rule: StackBufferOverflow on 'tab' (size 10) at line 9, and UninitializedLocalRead (CWE-457, confidence 0.90) at line 10. The summary at the top of the panel counts 2 warnings.",
 DONE),
("F13", "No false positive on an unreachable path", CRIT,
 "Check that path refinement discards a defect that cannot be reached.",
 "The datasets workspace is open.",
 "1. Open DS04_infeasible_path.c and read the code: the write buf[i] is guarded by n < 8 then n > 16\n2. Run the analysis with the default arguments",
 "No StackBufferOverflow is reported, even though the write is syntactically out of bounds: the guard makes it unreachable. Zero diagnostic is listed.",
 DONE),
("F14", "Report an error-level defect", CRIT,
 "Check the highest severity is produced and displayed as such.",
 "The datasets workspace is open.",
 "1. Open DS05_recursion.c in the active tab\n2. Run the analysis with the default arguments",
 "Two entries are listed for line 9: one INFO ('recursive or mutually recursive function detected') and one ERROR ('unconditional self recursion detected (no base case)', with 'this will eventually overflow the stack at runtime'). The ERROR entry is visually distinct from the INFO one, and the summary counts 1 error.",
 DONE),
("F15", "Analyse a C++ file", CRIT,
 "Check .cpp inputs are supported, not only C.",
 "The datasets workspace is open.",
 "1. Open DS06_cpp_array_oob.cpp in the active tab\n2. Run the analysis with the default arguments",
 "2 WARNINGs are reported: StackBufferOverflow on 'tab' (size 8) at line 10, and UninitializedLocalRead at line 12. The results are rendered the same way as for a C file.",
 DONE),
("F16", "Unsupported input file", CRIT,
 "Fail explicitly rather than silently on a file the analyser cannot read.",
 "The datasets workspace is open.",
 "1. Open DS07_invalid.txt in the active tab\n2. Run the analysis with the default arguments",
 "The analysis terminates and the panel reports the failure, quoting the analyser's message ('Unsupported input file type' / 'Failed to analyze'). The application does not hang and stays usable afterwards.",
 DONE),
("F17", "Custom analysis arguments", SEC,
 "Check the arguments field is passed through to the analyser.",
 "DS01_stack_overflow.c is open in the active tab.",
 "1. Open 'Ctrace Tools'\n2. Replace the arguments with: --invoke=notatool --sarif-format\n3. Click 'Run Analysis'\n4. Restore the default arguments and run again",
 "The first run fails and the panel surfaces the analyser's message listing the allowed tools (flawfinder, ikos, cppcheck, tscancode, ctrace_stack_analyzer). The second run produces the F10 result again, proving the field is really forwarded.",
 DONE),
("F18", "Jump from a diagnostic to the code", CRIT,
 "Navigate from a result to the offending line.",
 "The F12 analysis has been run on DS03_index_oob.c and its results are displayed.",
 "1. Click the StackBufferOverflow entry in the results panel",
 "The editor scrolls to line 9 of DS03_index_oob.c and highlights it; the status bar reads 'Ln 9, ...'. If the file is not the active tab, it is made active first.",
 DONE),
("F19", "Integrated terminal", SEC,
 "Run a shell command without leaving the application.",
 "The application is running.",
 "1. Click the Terminal icon in the activity bar (or menu View > Terminal)\n2. Type: ls -la\n3. Press Enter",
 "A terminal panel opens at the bottom, the command runs in the workspace folder, and its output is displayed. The prompt comes back ready for the next command.",
 DONE),
("F20", "Configure an AI provider", SEC,
 "Connect the assistant to a language model.",
 "The tester has an API key for one of the supported providers (OpenAI, Anthropic, Groq, Deepseek, Perplexity).",
 "1. Menu 'Assistant'\n2. Open the assistant settings\n3. Select a provider and paste the API key\n4. Pick a model from the list\n5. Click Save",
 "The model list is fetched after the key is entered (the status shows 'Fetching models...' then a populated list). After Save, the assistant panel is ready to accept a message and the key is not shown in clear text anywhere in the interface.",
 DONE),
("F21", "Ask about the current file", SEC,
 "Use the open source file as the assistant's context.",
 "A provider is configured (F20) and DS01_stack_overflow.c is open.",
 "1. Open the Assistant panel\n2. Click the 'Current file' context button\n3. Type: what is wrong with this code?\n4. Press Enter",
 "The context button becomes active and names the current file, a 'Thinking...' placeholder appears, then an answer is returned that refers to the buffer written past its bounds. Code blocks in the answer carry Copy and Replace buttons.",
 DONE),
("F22", "Ask about the analysis results", SEC,
 "Feed the diagnostics to the assistant.",
 "A provider is configured and the F10 analysis has been run.",
 "1. Open the Assistant panel\n2. Click the 'Analysis' context button\n3. Ask: how do I fix the reported warning?",
 "The context button reflects that results are attached (it reads 'No results' only when none exist), and the answer refers to the StackBufferOverflow reported on 'buf'.",
 DONE),
("F23", "Session restore", CRIT,
 "Do not lose work when the application is restarted.",
 "The datasets workspace is open with DS01_stack_overflow.c and DS03_index_oob.c in two tabs.",
 "1. Note the open tabs and the active one\n2. Close the application\n3. Start it again with ./run.sh and reload http://localhost:6080/",
 "On restart the same workspace is loaded, the same two tabs are reopened in the same order, and the tab that was active is active again. A tab whose file was deleted meanwhile is flagged as missing rather than opened empty.",
 DONE),
("F24", "Git decorations in the file tree", SEC,
 "Show which files in the workspace have uncommitted changes.",
 "The datasets folder has been turned into a git repository: run 'git init && git add -A && git commit -m init' in the integrated terminal first.",
 "1. Refresh the file tree\n2. In the integrated terminal, run: echo '// edit' >> DS02_clean.c\n3. Refresh the file tree again",
 "After step 1 no file is decorated. After step 3, DS02_clean.c is marked as modified in the tree and its parent folders carry the roll-up marker. A workspace that is not a git repository shows no decoration and raises no error.",
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
    "Version under test: CoreTrace GUI v5.1.0. Every expected result in the test plan was produced with the analysis binary bundled in that release.",
    "The whole plan runs in the Docker image in appendices/docker, on any computer with Docker (Linux, macOS, Windows). No scenario depends on the tester's operating system.",
    "The analyser requires clang 20: it compiles each file to LLVM IR before analysing it. Without clang 20 it reports 0 diagnostics for every input instead of failing, so run scenario F9 before F10 to F18. The Docker image already contains clang 20.",
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
