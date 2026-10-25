import { GenealogyData, Individual, Family } from '../types/genealogy';
import { shouldProtectPerson, sanitizePersonForPrivacy, sanitizeFamilyForPrivacy, getProtectedPersonIds } from './privacy';

export interface GedcomExportOptions {
  hideLiving?: boolean;
}

export interface GedcomExportResult {
  gedcom: string;
  report: {
    totalIndividuals: number;
    totalFamilies: number;
    maskedLivingCount: number;
    totalSources: number;
  };
}

export function serializeGedcom(data: GenealogyData, options: GedcomExportOptions = {}): string {
  const result = serializeGedcomWithReport(data, options);
  return result.gedcom;
}

export function serializeGedcomWithReport(data: GenealogyData, options: GedcomExportOptions = {}): GedcomExportResult {
  const lines: string[] = [];
  const hideLiving = options.hideLiving ?? false;
  let maskedLivingCount = 0;

  // Header
  lines.push('0 HEAD');
  lines.push('1 SOUR Genealogor');
  lines.push('2 VERS 2.0.0');
  lines.push('2 NAME Genealogor — Arbre Familial & Archives');
  lines.push('1 DATE ' + new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase());
  lines.push('1 GEDC');
  lines.push('2 VERS 5.5.1');
  lines.push('2 FORM LINEAGE-LINKED');
  lines.push('1 CHAR UTF-8');

  // Sources (Level 0)
  const sources = data.sources || {};
  for (const src of Object.values(sources)) {
    lines.push(`0 ${src.id} SOUR`);
    if (src.title) lines.push(`1 TITL ${src.title}`);
    if (src.author) lines.push(`1 AUTH ${src.author}`);
    if (src.publication) lines.push(`1 PUBL ${src.publication}`);
    if (src.callNumber) lines.push(`1 CALN ${src.callNumber}`);
    if (src.notes) {
      for (const note of src.notes) {
        lines.push(`1 NOTE ${note}`);
      }
    }
  }

  // Individuals
  const indList = Object.values(data.individuals);
  for (const rawIndi of indList) {
    let indi = rawIndi;
    let isMasked = false;
    if (hideLiving && shouldProtectPerson(rawIndi, undefined, data)) {
      indi = sanitizePersonForPrivacy(rawIndi, undefined, data);
      maskedLivingCount++;
      isMasked = true;
    }

    lines.push(`0 ${indi.id} INDI`);
    if (isMasked) {
      lines.push(`1 NAME ${indi.surname || ''} [Privé]`);
      lines.push(`2 GIVN [Confidentiel]`);
      if (indi.surname) lines.push(`2 SURN ${indi.surname}`);
    } else {
      const surnamePart = indi.surname ? `/${indi.surname}/` : '';
      const givenPart = indi.givenName || '';
      const nameLine = [givenPart, surnamePart].filter(Boolean).join(' ').trim() || indi.name || 'Inconnu';
      lines.push(`1 NAME ${nameLine}`);
      if (indi.givenName) lines.push(`2 GIVN ${indi.givenName}`);
      if (indi.surname) lines.push(`2 SURN ${indi.surname}`);
    }
    lines.push(`1 SEX ${indi.sex || 'X'}`);

    if (indi.birth) {
      lines.push('1 BIRT');
      if (indi.birth.date) lines.push(`2 DATE ${indi.birth.date}`);
      if (indi.birth.place) lines.push(`2 PLAC ${indi.birth.place}`);
      if (indi.birth.citations) {
        for (const cit of indi.birth.citations) {
          lines.push(`2 SOUR ${cit.sourceId}`);
          if (cit.page) lines.push(`3 PAGE ${cit.page}`);
        }
      }
    }
    if (indi.baptism) {
      lines.push('1 BAPM');
      if (indi.baptism.date) lines.push(`2 DATE ${indi.baptism.date}`);
      if (indi.baptism.place) lines.push(`2 PLAC ${indi.baptism.place}`);
      if (indi.baptism.citations) {
        for (const cit of indi.baptism.citations) {
          lines.push(`2 SOUR ${cit.sourceId}`);
          if (cit.page) lines.push(`3 PAGE ${cit.page}`);
        }
      }
    }
    if (indi.death) {
      lines.push('1 DEAT');
      if (indi.death.date) lines.push(`2 DATE ${indi.death.date}`);
      if (indi.death.place) lines.push(`2 PLAC ${indi.death.place}`);
      if (indi.death.citations) {
        for (const cit of indi.death.citations) {
          lines.push(`2 SOUR ${cit.sourceId}`);
          if (cit.page) lines.push(`3 PAGE ${cit.page}`);
        }
      }
    }
    if (indi.burial) {
      lines.push('1 BURI');
      if (indi.burial.date) lines.push(`2 DATE ${indi.burial.date}`);
      if (indi.burial.place) lines.push(`2 PLAC ${indi.burial.place}`);
      if (indi.burial.citations) {
        for (const cit of indi.burial.citations) {
          lines.push(`2 SOUR ${cit.sourceId}`);
          if (cit.page) lines.push(`3 PAGE ${cit.page}`);
        }
      }
    }

    if (indi.occupations) {
      for (const occ of indi.occupations) {
        lines.push(`1 OCCU ${occ}`);
      }
    }

    for (const famc of indi.familiesAsChild) {
      lines.push(`1 FAMC ${famc}`);
    }
    for (const fams of indi.familiesAsSpouse) {
      lines.push(`1 FAMS ${fams}`);
    }

    if (indi.citations) {
      for (const cit of indi.citations) {
        lines.push(`1 SOUR ${cit.sourceId}`);
        if (cit.page) lines.push(`2 PAGE ${cit.page}`);
      }
    }

    if (indi.media) {
      for (const m of indi.media) {
        lines.push('1 OBJE');
        if (m.file) lines.push(`2 FILE ${m.file}`);
        if (m.format) lines.push(`2 FORM ${m.format}`);
        if (m.title) lines.push(`2 TITL ${m.title}`);
      }
    }

    if (indi.notes) {
      for (const note of indi.notes) {
        const noteLines = note.split('\n');
        lines.push(`1 NOTE ${noteLines[0]}`);
        for (let j = 1; j < noteLines.length; j++) {
          lines.push(`2 CONT ${noteLines[j]}`);
        }
      }
    }

    if (indi._unsupportedTags) {
      for (const t of indi._unsupportedTags) {
        lines.push(`${t.level} ${t.tag} ${t.value}`);
      }
    }
  }

  // Families
  const protectedIds = hideLiving ? getProtectedPersonIds(data) : new Set<string>();
  const famList = Object.values(data.families);
  for (const rawFam of famList) {
    const fam = hideLiving ? sanitizeFamilyForPrivacy(rawFam, protectedIds) : rawFam;
    lines.push(`0 ${fam.id} FAM`);
    if (fam.husbandId) lines.push(`1 HUSB ${fam.husbandId}`);
    if (fam.wifeId) lines.push(`1 WIFE ${fam.wifeId}`);

    for (const childId of fam.childrenIds) {
      lines.push(`1 CHIL ${childId}`);
    }

    if (fam.marriage) {
      lines.push('1 MARR');
      if (fam.marriage.date) lines.push(`2 DATE ${fam.marriage.date}`);
      if (fam.marriage.place) lines.push(`2 PLAC ${fam.marriage.place}`);
      if (fam.marriage.citations) {
        for (const cit of fam.marriage.citations) {
          lines.push(`2 SOUR ${cit.sourceId}`);
          if (cit.page) lines.push(`3 PAGE ${cit.page}`);
        }
      }
    }
    if (fam.divorce) {
      lines.push('1 DIV');
      if (fam.divorce.date) lines.push(`2 DATE ${fam.divorce.date}`);
    }

    if (fam.citations) {
      for (const cit of fam.citations) {
        lines.push(`1 SOUR ${cit.sourceId}`);
        if (cit.page) lines.push(`2 PAGE ${cit.page}`);
      }
    }

    if (fam.media) {
      for (const m of fam.media) {
        lines.push('1 OBJE');
        if (m.file) lines.push(`2 FILE ${m.file}`);
        if (m.format) lines.push(`2 FORM ${m.format}`);
        if (m.title) lines.push(`2 TITL ${m.title}`);
      }
    }

    if (fam.notes) {
      for (const note of fam.notes) {
        lines.push(`1 NOTE ${note}`);
      }
    }

    if (fam._unsupportedTags) {
      for (const t of fam._unsupportedTags) {
        lines.push(`${t.level} ${t.tag} ${t.value}`);
      }
    }
  }

  lines.push('0 TRLR');

  return {
    gedcom: lines.join('\n'),
    report: {
      totalIndividuals: indList.length,
      totalFamilies: famList.length,
      maskedLivingCount,
      totalSources: Object.keys(sources).length,
    },
  };
}
