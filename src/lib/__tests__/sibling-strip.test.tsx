import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { SiblingStrip } from '../../components/views/SiblingStrip';
import type { GenealogyData, Individual } from '../../types/genealogy';

describe('Fratrie sur le même plan horizontal (SiblingStrip)', () => {
  // Test data fixture with 5 children
  const mockIndividuals: Record<string, Individual> = {
    '@I_FATHER@': {
      id: '@I_FATHER@',
      name: 'Pierre DUPONT',
      sex: 'M',
      familiesAsSpouse: ['@F1@'],
      familiesAsChild: [],
    },
    '@I_MOTHER@': {
      id: '@I_MOTHER@',
      name: 'Marie MARTIN',
      sex: 'F',
      familiesAsSpouse: ['@F1@'],
      familiesAsChild: [],
    },
    // Child 1 (Oldest, 1840)
    '@I_CHILD_1@': {
      id: '@I_CHILD_1@',
      name: 'Jean DUPONT',
      givenName: 'Jean',
      surname: 'DUPONT',
      sex: 'M',
      birth: { date: '12 MAR 1840', parsedDate: { raw: '1840', year: 1840, month: 3, day: 12 } },
      death: { date: '1905' },
      familiesAsChild: ['@F1@'],
      familiesAsSpouse: [],
      sosaNumber: 4,
    },
    // Child 2 (Elder sister, 1843)
    '@I_CHILD_2@': {
      id: '@I_CHILD_2@',
      name: 'Jeanne DUPONT',
      givenName: 'Jeanne',
      surname: 'DUPONT',
      sex: 'F',
      birth: { date: '05 JUN 1843', parsedDate: { raw: '1843', year: 1843, month: 6, day: 5 } },
      familiesAsChild: ['@F1@'],
      familiesAsSpouse: [],
    },
    // Child 3 (Current selected person, 1846)
    '@I_CHILD_3@': {
      id: '@I_CHILD_3@',
      name: 'Louis DUPONT',
      givenName: 'Louis',
      surname: 'DUPONT',
      sex: 'M',
      birth: { date: '20 OCT 1846', parsedDate: { raw: '1846', year: 1846, month: 10, day: 20 } },
      death: { date: '1918' },
      familiesAsChild: ['@F1@'],
      familiesAsSpouse: [],
    },
    // Child 4 (Cadette, 1850)
    '@I_CHILD_4@': {
      id: '@I_CHILD_4@',
      name: 'Marguerite DUPONT',
      givenName: 'Marguerite',
      surname: 'DUPONT',
      sex: 'F',
      birth: { date: '1850', parsedDate: { raw: '1850', year: 1850 } },
      familiesAsChild: ['@F1@'],
      familiesAsSpouse: [],
    },
    // Child 5 (Benjamin, 1854)
    '@I_CHILD_5@': {
      id: '@I_CHILD_5@',
      name: 'Henri DUPONT',
      givenName: 'Henri',
      surname: 'DUPONT',
      sex: 'M',
      birth: { date: '1854', parsedDate: { raw: '1854', year: 1854 } },
      familiesAsChild: ['@F1@'],
      familiesAsSpouse: [],
    },
    // Only child in another family
    '@I_SOLO@': {
      id: '@I_SOLO@',
      name: 'Antoine SEUL',
      givenName: 'Antoine',
      sex: 'M',
      familiesAsChild: ['@F_SOLO@'],
      familiesAsSpouse: [],
    },
  };

  const mockData: GenealogyData = {
    individuals: mockIndividuals,
    families: {
      '@F1@': {
        id: '@F1@',
        husbandId: '@I_FATHER@',
        wifeId: '@I_MOTHER@',
        childrenIds: ['@I_CHILD_1@', '@I_CHILD_2@', '@I_CHILD_3@', '@I_CHILD_4@', '@I_CHILD_5@'],
      },
      '@F_SOLO@': {
        id: '@F_SOLO@',
        childrenIds: ['@I_SOLO@'],
      },
    },
    sources: {},
  };

  const sosaMap: Record<string, number> = {
    '@I_CHILD_1@': 4,
  };

  it('affiche tous les frères et sœurs sur le même plan horizontal avec le nombre correct', () => {
    const selectedPerson = mockIndividuals['@I_CHILD_3@'];
    const html = renderToString(
      <SiblingStrip
        person={selectedPerson}
        data={mockData}
        sosaMap={sosaMap}
        onSelectPerson={() => {}}
      />
    );

    // Section title & total count
    expect(html).toContain('Fratrie · Frères &amp; Sœurs sur le même plan');
    expect(html).toContain('5 enfants');

    // Counts of older (left) and younger (right)
    expect(html).toContain('2 aînés à gauche');
    expect(html).toContain('2 cadets à droite');

    // Contains all siblings' names
    expect(html).toContain('Jean DUPONT');
    expect(html).toContain('Jeanne DUPONT');
    expect(html).toContain('Louis DUPONT');
    expect(html).toContain('Marguerite DUPONT');
    expect(html).toContain('Henri DUPONT');
  });

  it('place les aînés à gauche et les cadets à droite de la personne sélectionnée', () => {
    const selectedPerson = mockIndividuals['@I_CHILD_3@'];
    const html = renderToString(
      <SiblingStrip
        person={selectedPerson}
        data={mockData}
        sosaMap={sosaMap}
        onSelectPerson={() => {}}
      />
    );

    // Current person badge
    expect(html).toContain('Fiche consultée');
    expect(html).toContain('Au centre du plan');

    // Check chronological order in HTML output
    const indexChild1 = html.indexOf('Jean DUPONT');
    const indexChild2 = html.indexOf('Jeanne DUPONT');
    const indexChild3 = html.indexOf('Louis DUPONT'); // Selected
    const indexChild4 = html.indexOf('Marguerite DUPONT');
    const indexChild5 = html.indexOf('Henri DUPONT');

    expect(indexChild1).toBeLessThan(indexChild2);
    expect(indexChild2).toBeLessThan(indexChild3);
    expect(indexChild3).toBeLessThan(indexChild4);
    expect(indexChild4).toBeLessThan(indexChild5);

    // Badges
    expect(html).toContain('Aîné');
    expect(html).toContain('Benjamin');
  });

  it('affiche les différences d\'âge relatives (+6 ans plus âgé, 8 ans plus jeune, etc.)', () => {
    const selectedPerson = mockIndividuals['@I_CHILD_3@']; // Born 1846
    const html = renderToString(
      <SiblingStrip
        person={selectedPerson}
        data={mockData}
        sosaMap={sosaMap}
        onSelectPerson={() => {}}
      />
    );

    // Child 1 (1840) vs Louis (1846) = 6 years older
    expect(html).toContain('6 ans plus âgé(e)');
    // Child 5 (1854) vs Louis (1846) = 8 years younger
    expect(html).toContain('8 ans plus jeune');
  });

  it('affiche le numéro Sosa sur la carte du frère/sœur concerné', () => {
    const selectedPerson = mockIndividuals['@I_CHILD_3@'];
    const html = renderToString(
      <SiblingStrip
        person={selectedPerson}
        data={mockData}
        sosaMap={sosaMap}
        onSelectPerson={() => {}}
      />
    );

    expect(html).toContain('Sosa 4');
  });

  it('fournit les contrôles tactiles et souris (glisser avec la souris ou le doigt)', () => {
    const selectedPerson = mockIndividuals['@I_CHILD_3@'];
    const html = renderToString(
      <SiblingStrip
        person={selectedPerson}
        data={mockData}
        sosaMap={sosaMap}
        onSelectPerson={() => {}}
      />
    );

    // Indicators for mouse and touch gestures
    expect(html).toContain('Déplacez avec la souris ou le doigt');
    expect(html).toContain('Recentrer');
    expect(html).toContain('Faire défiler vers la gauche');
    expect(html).toContain('Faire défiler vers la droite');
  });

  it('gère élégamment le cas d\'un enfant unique sans régression', () => {
    const soloPerson = mockIndividuals['@I_SOLO@'];
    const html = renderToString(
      <SiblingStrip
        person={soloPerson}
        data={mockData}
        sosaMap={{}}
        onSelectPerson={() => {}}
      />
    );

    expect(html).toContain('Fratrie · Enfant unique répertorié');
    expect(html).toContain('Aucun frère ni sœur');
  });
});
