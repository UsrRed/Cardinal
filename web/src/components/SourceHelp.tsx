import type { SourceType } from '../../../src/shared/types.js';

export const OSV_ECOSYSTEMS = ['PyPI', 'npm', 'Go', 'crates.io', 'Maven', 'NuGet', 'RubyGems', 'Packagist'] as const;

export function SourceHelp({ type }: { type: SourceType }) {
  if (type === 'rss') {
    return (
      <aside className="help" aria-label="Aide source RSS">
        <h4>Source RSS / Atom</h4>
        <p>Indiquez une ou plusieurs URL de flux RSS 2.0 ou Atom (http ou https), une par ligne, jusqu’à 20.</p>
        <div className="chips">
          <span>https://hnrss.org/frontpage</span>
          <span>https://www.cert.ssi.gouv.fr/feed/</span>
          <span>https://github.com/owner/repo/releases.atom</span>
        </div>
        <p>Utilisez « Tester l’URL » pour vérifier qu’un flux est lisible.</p>
      </aside>
    );
  }
  if (type === 'osv') {
    return (
      <aside className="help" aria-label="Aide source OSV">
        <h4>Source OSV (vulnérabilités de paquets)</h4>
        <p>Ajoutez jusqu’à 50 paquets avec leur écosystème. Écosystèmes pris en charge :</p>
        <div className="chips">{OSV_ECOSYSTEMS.map((e) => <span key={e}>{e}</span>)}</div>
        <p>Le nom doit être celui du gestionnaire de paquets (ex. « requests » pour PyPI).</p>
      </aside>
    );
  }
  return (
    <aside className="help" aria-label="Aide source NVD">
      <h4>Source NVD (CVE)</h4>
      <p>Saisissez des mots-clés précis (produit, éditeur, bibliothèque) : « openssl », « apache tomcat ». Les termes trop génériques ramènent beaucoup de bruit.</p>
      <p>Vous pouvez filtrer par sévérité minimale. Sans clé API NVD la limite est de 5 requêtes par 30 s ; avec une clé (Réglages) elle passe à 50, ce qui accélère les runs.</p>
    </aside>
  );
}
