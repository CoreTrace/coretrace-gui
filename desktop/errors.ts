/**
 * The desktop's Rust side answers in English, and those answers are stable
 * enough to serve as keys. This is the one place they become French, so the
 * interface does not change language at the exact moment the reader most
 * needs to understand it.
 *
 * Whatever a tool itself printed — git, ctrace, the platform — stays as a
 * detail after the translated line: it is evidence, not interface.
 */
const EXACT: Record<string, string> = {
  // analysis
  "Choose the installed ctrace executable in Settings first":
    "Choisissez d’abord le programme ctrace dans les paramètres.",
  "An analysis is already running": "Une analyse est déjà en cours.",
  "This folder holds no C or C++ source files to analyse":
    "Ce dossier ne contient aucun fichier source C ou C++ à analyser.",
  "Choose one source file without a comma in its path":
    "Choisissez un seul fichier source, sans virgule dans son chemin.",
  "Analysis exceeded 15 minutes and was stopped":
    "L’analyse a dépassé 15 minutes et a été arrêtée.",
  "Analysis has not stopped yet; keep the window open and try again":
    "L’analyse ne s’est pas encore arrêtée ; gardez la fenêtre ouverte et réessayez.",
  "Choose an installed ctrace executable": "Choisissez un programme ctrace installé.",
  "Choose a JSON file": "Choisissez un fichier JSON.",
  "Unknown analysis setting": "Paramètre d’analyse inconnu.",
  // workspace
  "Choose a folder": "Choisissez un dossier.",
  "Only workspace-relative paths are allowed":
    "Seuls les chemins relatifs au dossier ouvert sont autorisés.",
  "Git metadata and alternate streams cannot be edited":
    "Les métadonnées Git ne peuvent pas être modifiées.",
  "Path leaves the selected workspace": "Ce chemin sort du dossier ouvert.",
  "Git metadata cannot be edited through an alias":
    "Les métadonnées Git ne peuvent pas être modifiées.",
  "Choose a text file smaller than 4 MiB":
    "Choisissez un fichier texte de moins de 4 Mio.",
  "File exceeds 4 MiB": "Le fichier dépasse 4 Mio.",
  "Binary files cannot be edited": "Les fichiers binaires ne peuvent pas être modifiés.",
  "Folder contains more than 5,000 entries; open a smaller folder":
    "Ce dossier contient plus de 5 000 entrées ; ouvrez un dossier plus petit.",
  "Invalid or oversized text": "Texte invalide ou trop volumineux.",
  "File is read-only": "Le fichier est en lecture seule.",
  "Missing parent folder": "Le dossier parent n’existe plus.",
  "File changed on disk. Reopen it before saving; your draft has been kept.":
    "Le fichier a changé sur le disque. Rouvrez-le avant d’enregistrer ; votre brouillon est conservé.",
  "File changed while saving; your draft has been kept":
    "Le fichier a changé pendant l’enregistrement ; votre brouillon est conservé.",
  "Workspace changed; reopen the file": "Le dossier a changé ; rouvrez le fichier.",
  // github
  "Use owner/repository or https://github.com/owner/repository":
    "Indiquez propriétaire/dépôt ou https://github.com/propriétaire/dépôt.",
  "Clone timed out. An incomplete folder may remain; inspect it before retrying.":
    "Le clonage a expiré. Un dossier incomplet peut subsister ; vérifiez-le avant de réessayer.",
  // cloud run
  Cancelled: "Annulée.",
  "The platform has not priced this analysis yet.":
    "La plateforme n’a pas encore chiffré cette analyse.",
  "No run is waiting for approval": "Aucune analyse n’attend votre accord.",
  "The platform created no job": "La plateforme n’a créé aucune analyse.",
  "The upload expired before it was verified.":
    "L’envoi a expiré avant d’être vérifié.",
  "The platform did not finish verifying the upload.":
    "La plateforme n’a pas fini de vérifier l’envoi.",
  "The upload is verified but names no input.":
    "L’envoi est vérifié mais ne désigne aucune entrée.",
  "The platform returned no upload address":
    "La plateforme n’a renvoyé aucune adresse d’envoi.",
  "The platform authorised no upload": "La plateforme n’a autorisé aucun envoi.",
  "The analysis is taking longer than expected; it is still running in the cloud.":
    "L’analyse prend plus de temps que prévu ; elle continue dans le cloud.",
  // cloud / sign-in
  "Sign in to CoreTrace first": "Connectez-vous d’abord à CoreTrace.",
  "Choose an organisation": "Choisissez une organisation.",
  "Choose a branch, tag or commit": "Choisissez une branche, un tag ou un commit.",
  "Sign-in code expired; start again": "Le code de connexion a expiré ; recommencez.",
  "No sign-in in progress": "Aucune connexion en cours.",
  "Only HTTPS links may be opened": "Seuls les liens HTTPS peuvent être ouverts.",
  "Report checksum mismatch": "Le rapport reçu ne correspond pas à son empreinte.",
  "Report exceeds 10 MiB": "Le rapport dépasse 10 Mio.",
  "Report exceeds the desktop limit of 10 MiB": "Le rapport dépasse 10 Mio.",
  "Report is not UTF-8": "Le rapport n’est pas en UTF-8.",
  "Could not download report": "Impossible de télécharger le rapport.",
  "Platform response exceeds 8 MiB": "La réponse de la plateforme dépasse 8 Mio.",
};

/** Messages that carry a variable tail, matched on their head. */
const PREFIX: [string, string][] = [
  ["Cannot start ctrace: ", "Impossible de lancer ctrace"],
  ["Git clone failed.", "Le clonage Git a échoué"],
  ["Git is required: ", "Git est requis"],
  ["Report download failed (HTTP ", "Le téléchargement du rapport a échoué"],
  ["Cannot write the archive: ", "Impossible d’écrire l’archive"],
  ["Cannot add ", "Impossible d’ajouter un fichier à l’archive"],
  ["Could not create the clone folder: ", "Impossible de créer le dossier de clonage"],
  ["No application data directory: ", "Aucun dossier de données pour l’application"],
  ["No configuration directory: ", "Aucun dossier de configuration"],
];

export function translateError(text: string): string {
  const trimmed = text.trim();
  const exact = EXACT[trimmed];
  if (exact) return exact;
  for (const [head, french] of PREFIX) {
    if (trimmed.startsWith(head)) {
      const detail = trimmed.slice(head.length).trim();
      return detail ? `${french} — ${detail}` : `${french}.`;
    }
  }
  return trimmed;
}
