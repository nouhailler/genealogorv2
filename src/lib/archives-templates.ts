// Research-link templates for French departmental archives + generic portals
// (Geneanet, FamilySearch, Filae, Gallica, Wikidata).
//
// API:
//   linksFor({ person, place }) -> ArchiveLink[]
//   deptArchives(deptCode)      -> { label, url } | null

import { cityFromPlace, extractDept } from './place-gazetteer';
import type { Individual } from '../types/genealogy';

export interface ArchiveLink {
  kind: 'portal' | 'archives';
  source: string;
  label: string;
  url: string;
  dept?: string;
}

export interface AdEntry {
  url: string;
  label: string;
}

export const AD: Record<string, AdEntry> = {
  "01": { url: "https://www.archives.ain.fr/archives-en-ligne/etat-civil/", label: "AD Ain" },
  "02": { url: "https://archives.aisne.fr/", label: "AD Aisne" },
  "03": { url: "https://archives.allier.fr/", label: "AD Allier" },
  "04": { url: "https://www.archives04.fr/", label: "AD Alpes-de-Haute-Provence" },
  "05": { url: "https://www.archives05.fr/", label: "AD Hautes-Alpes" },
  "06": { url: "https://www.basesdocumentaires-cg06.fr/archives/", label: "AD Alpes-Maritimes" },
  "07": { url: "https://archives.ardeche.fr/", label: "AD Ardèche" },
  "08": { url: "https://archives.cd08.fr/", label: "AD Ardennes" },
  "09": { url: "https://archivesenligne.ariege.fr/", label: "AD Ariège" },
  "10": { url: "https://archives-aube.fr/", label: "AD Aube" },
  "11": { url: "https://recherche.archivesdepartementales.aude.fr/", label: "AD Aude" },
  "12": { url: "https://archives.aveyron.fr/", label: "AD Aveyron" },
  "13": { url: "https://www.archives13.fr/", label: "AD Bouches-du-Rhône" },
  "14": { url: "https://archives.calvados.fr/", label: "AD Calvados" },
  "15": { url: "https://archives.cantal.fr/", label: "AD Cantal" },
  "16": { url: "https://www.archives-charente.fr/", label: "AD Charente" },
  "17": { url: "https://www.archinoe.net/cg17/", label: "AD Charente-Maritime" },
  "18": { url: "https://www.archives18.fr/", label: "AD Cher" },
  "19": { url: "https://archives.correze.fr/", label: "AD Corrèze" },
  "21": { url: "https://archives.cotedor.fr/", label: "AD Côte-d'Or" },
  "22": { url: "https://archives.cotesdarmor.fr/", label: "AD Côtes-d'Armor" },
  "23": { url: "https://archives.creuse.fr/", label: "AD Creuse" },
  "24": { url: "https://archives.dordogne.fr/", label: "AD Dordogne" },
  "25": { url: "https://memoirevive.besancon.fr/ark:/48565/a01136293559148WgxX/", label: "AD Doubs" },
  "26": { url: "https://archives.ladrome.fr/", label: "AD Drôme" },
  "27": { url: "https://archives.eure.fr/", label: "AD Eure" },
  "28": { url: "https://www.archives28.fr/", label: "AD Eure-et-Loir" },
  "29": { url: "https://mnesys-portal.archives-finistere.fr/", label: "AD Finistère" },
  "2A": { url: "https://www.archivi.corsica/", label: "AD Corse-du-Sud" },
  "2B": { url: "https://www.archivi.corsica/", label: "AD Haute-Corse" },
  "30": { url: "https://archives.gard.fr/", label: "AD Gard" },
  "31": { url: "https://archives.haute-garonne.fr/", label: "AD Haute-Garonne" },
  "32": { url: "https://archives.gers.fr/", label: "AD Gers" },
  "33": { url: "https://archives.gironde.fr/", label: "AD Gironde" },
  "34": { url: "https://pierresvives.herault.fr/", label: "AD Hérault" },
  "35": { url: "https://archives.ille-et-vilaine.fr/", label: "AD Ille-et-Vilaine" },
  "36": { url: "https://archives.indre.fr/", label: "AD Indre" },
  "37": { url: "https://archives.touraine.fr/", label: "AD Indre-et-Loire" },
  "38": { url: "https://archives.isere.fr/", label: "AD Isère" },
  "39": { url: "https://archives39.fr/", label: "AD Jura" },
  "40": { url: "https://archives.landes.fr/", label: "AD Landes" },
  "41": { url: "https://archives.loir-et-cher.fr/", label: "AD Loir-et-Cher" },
  "42": { url: "https://archives.loire.fr/", label: "AD Loire" },
  "43": { url: "https://archives.hauteloire.fr/", label: "AD Haute-Loire" },
  "44": { url: "https://archives.loire-atlantique.fr/", label: "AD Loire-Atlantique" },
  "45": { url: "https://www.archives-loiret.fr/", label: "AD Loiret" },
  "46": { url: "https://archives.lot.fr/", label: "AD Lot" },
  "47": { url: "https://www.archives.lot-et-garonne.fr/", label: "AD Lot-et-Garonne" },
  "48": { url: "https://archives.lozere.fr/", label: "AD Lozère" },
  "49": { url: "https://archives49.fr/", label: "AD Maine-et-Loire" },
  "50": { url: "https://archives.manche.fr/", label: "AD Manche" },
  "51": { url: "https://archives.marne.fr/", label: "AD Marne" },
  "52": { url: "https://archives.haute-marne.fr/", label: "AD Haute-Marne" },
  "53": { url: "https://lamayenne.fr/archives53", label: "AD Mayenne" },
  "54": { url: "https://archives.meurthe-et-moselle.fr/", label: "AD Meurthe-et-Moselle" },
  "55": { url: "https://archives.meuse.fr/", label: "AD Meuse" },
  "56": { url: "https://patrimoine.morbihan.fr/", label: "AD Morbihan" },
  "57": { url: "https://archives57.com/", label: "AD Moselle" },
  "58": { url: "https://archives.nievre.fr/", label: "AD Nièvre" },
  "59": { url: "https://archivesdepartementales.lenord.fr/", label: "AD Nord" },
  "60": { url: "https://archives.oise.fr/", label: "AD Oise" },
  "61": { url: "https://archives.orne.fr/", label: "AD Orne" },
  "62": { url: "https://archivesenligne.pasdecalais.fr/", label: "AD Pas-de-Calais" },
  "63": { url: "https://archivesdepartementales.puy-de-dome.fr/", label: "AD Puy-de-Dôme" },
  "64": { url: "https://earchives.le64.fr/", label: "AD Pyrénées-Atlantiques" },
  "65": { url: "https://archivesenligne.hautespyrenees.fr/", label: "AD Hautes-Pyrénées" },
  "66": { url: "https://archives.cd66.fr/", label: "AD Pyrénées-Orientales" },
  "67": { url: "https://archives.bas-rhin.fr/", label: "AD Bas-Rhin" },
  "68": { url: "https://archives.haut-rhin.fr/", label: "AD Haut-Rhin" },
  "69": { url: "https://archives.rhone.fr/", label: "AD Rhône" },
  "70": { url: "https://archives.haute-saone.fr/", label: "AD Haute-Saône" },
  "71": { url: "https://www.archives71.fr/", label: "AD Saône-et-Loire" },
  "72": { url: "https://archives.sarthe.com/", label: "AD Sarthe" },
  "73": { url: "https://archives.savoie.fr/", label: "AD Savoie" },
  "74": { url: "https://archives.haute-savoie.fr/", label: "AD Haute-Savoie" },
  "75": { url: "https://archives.paris.fr/", label: "AD Paris" },
  "76": { url: "https://www.archivesdepartementales76.net/", label: "AD Seine-Maritime" },
  "77": { url: "https://archives.seine-et-marne.fr/", label: "AD Seine-et-Marne" },
  "78": { url: "https://archives.yvelines.fr/", label: "AD Yvelines" },
  "79": { url: "https://archives.deux-sevres.fr/", label: "AD Deux-Sèvres" },
  "80": { url: "https://archives.somme.fr/", label: "AD Somme" },
  "81": { url: "https://archives.tarn.fr/", label: "AD Tarn" },
  "82": { url: "https://archivesenligne.tarn-et-garonne.fr/", label: "AD Tarn-et-Garonne" },
  "83": { url: "https://archives.var.fr/", label: "AD Var" },
  "84": { url: "https://archives.vaucluse.fr/", label: "AD Vaucluse" },
  "85": { url: "https://www.archinoe.net/cg85/", label: "AD Vendée" },
  "86": { url: "https://archives-deux-sevres-vienne.fr/", label: "AD Vienne" },
  "87": { url: "https://archives.haute-vienne.fr/", label: "AD Haute-Vienne" },
  "88": { url: "https://archives.vosges.fr/", label: "AD Vosges" },
  "89": { url: "https://archives.yonne.fr/", label: "AD Yonne" },
  "90": { url: "https://archives.territoiredebelfort.fr/", label: "AD Territoire de Belfort" },
  "91": { url: "https://www.archives.essonne.fr/", label: "AD Essonne" },
  "92": { url: "https://archives.hauts-de-seine.fr/", label: "AD Hauts-de-Seine" },
  "93": { url: "https://archives.seinesaintdenis.fr/", label: "AD Seine-Saint-Denis" },
  "94": { url: "https://archives.valdemarne.fr/", label: "AD Val-de-Marne" },
  "95": { url: "https://archives.valdoise.fr/", label: "AD Val-d'Oise" },
  "971": { url: "https://archivesguadeloupe.fr/", label: "AD Guadeloupe" },
  "972": { url: "https://archives-martinique.fr/", label: "AD Martinique" },
  "973": { url: "https://archives.ctguyane.fr/", label: "AD Guyane" },
  "974": { url: "https://www.departement974.fr/archives/", label: "AD La Réunion" },
  "976": { url: "https://archivesmayotte.cg976.fr/", label: "AD Mayotte" },
};

export function deptArchives(deptCode: string | null | undefined): AdEntry | null {
  if (!deptCode) return null;
  return AD[deptCode] || null;
}

export function linksFor({ person, place }: { person: Individual | null; place?: string | null }): ArchiveLink[] {
  const out: ArchiveLink[] = [];
  const surname = person?.surname || (person?.name ? person.name.split(' ').slice(1).join(' ') : '');
  const given = person?.givenName || (person?.name ? person.name.split(' ')[0] : '');
  const city = place ? cityFromPlace(place) : '';
  const dept = place ? extractDept(place) : null;
  const enc = encodeURIComponent;

  const geneanet = `https://www.geneanet.org/recherche/?type_recherche=p&prenom=${enc(given)}&nom=${enc(surname)}${city ? `&place=${enc(city)}` : ''}`;
  const familysearch = `https://www.familysearch.org/search/record/results?q.givenName=${enc(given)}&q.surname=${enc(surname)}${city ? `&q.birthLikePlace=${enc(city)}` : ''}&q.collectionId=2037908`;
  const filae = `https://www.filae.com/registres-etat-civil-naissance-mariage-deces/?nom=${enc(surname)}&prenom=${enc(given)}&commune=${enc(city)}`;
  const wikidata = `https://www.wikidata.org/w/index.php?search=${enc(`${given} ${surname}`)}&search=`;
  const gallica = `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&query=%22${enc(surname)}%22${city ? `+%22${enc(city)}%22` : ''}&suggest=10`;

  out.push({ kind: 'portal', source: 'Geneanet', label: `Rechercher sur Geneanet${city ? ` (${city})` : ''}`, url: geneanet });
  out.push({ kind: 'portal', source: 'FamilySearch', label: 'Rechercher sur FamilySearch', url: familysearch });
  out.push({ kind: 'portal', source: 'Filae', label: 'Rechercher sur Filae', url: filae });
  out.push({ kind: 'portal', source: 'Gallica BnF', label: 'Presse & livres anciens (Gallica BnF)', url: gallica });
  out.push({ kind: 'portal', source: 'Wikidata', label: 'Wikidata & Wikipédia', url: wikidata });

  const ad = deptArchives(dept);
  if (ad) {
    out.push({
      kind: 'archives',
      source: ad.label,
      label: `${ad.label} — Registres en ligne${city ? ` (${city})` : ''}`,
      url: ad.url,
      dept: dept ?? undefined,
    });
  }

  return out;
}

export const ArchivesTemplates = { linksFor, deptArchives, AD };
