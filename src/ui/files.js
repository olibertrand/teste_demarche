// Enregistrer un texte dans un fichier. Dans la version en ligne sur claude.ai, par la capacité
// « downloads » (la page n'y télécharge rien elle-même) ; dans le fichier autonome, par la fenêtre
// « Enregistrer sous » du navigateur quand il la propose, sinon par un téléchargement.

let downloadsPromise = null;

/** La capacité « downloads » de claude.ai, ou null ailleurs. */
function getDownloads() {
  if (!downloadsPromise) {
    const claude = typeof window === 'undefined' ? undefined : window.claude;
    downloadsPromise =
      typeof claude?.use === 'function' ? Promise.resolve(claude.use('downloads')).catch(() => null) : Promise.resolve(null);
  }
  return downloadsPromise;
}

const TYPES = { txt: 'text/plain', py: 'text/x-python', html: 'text/html' };

/**
 * Propose d'enregistrer un texte dans un fichier.
 * @returns {Promise<{status: 'saved' | 'declined', filename: string}>} ; une erreur porte un message
 *   en français
 */
export async function saveText(filename, text) {
  const downloads = await getDownloads();
  if (downloads) {
    // claude.ai n'accepte pas l'extension .py : le programme est enregistré en texte
    const name = filename.endsWith('.py') ? `${filename}.txt` : filename;
    try {
      await downloads.save({ filename: name, data: text });
      return { status: 'saved', filename: name };
    } catch (e) {
      if (e?.code === 'declined') return { status: 'declined', filename: name };
      if (e?.code === 'rate_limited') throw new Error('Une demande d’enregistrement est déjà ouverte : réponds-y d’abord.');
      throw new Error('L’enregistrement de fichiers n’est pas possible ici.');
    }
  }
  const ext = filename.split('.').pop();
  const type = TYPES[ext] ?? 'text/plain';
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: filename, accept: { [type]: [`.${ext}`] } }] });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return { status: 'saved', filename: handle.name ?? filename };
    } catch (e) {
      if (e?.name === 'AbortError') return { status: 'declined', filename };
      // fenêtre refusée par le navigateur : on télécharge
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { status: 'saved', filename };
}

/** Nom de fichier daté, pour ne pas écraser le précédent : demarche-2026-11-05-14h32.txt */
export function datedName(prefix, ext, date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${prefix}-${day}-${pad(date.getHours())}h${pad(date.getMinutes())}.${ext}`;
}
