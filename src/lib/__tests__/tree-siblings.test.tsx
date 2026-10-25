import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { TreeView } from '../../components/views/TreeView';
import { TreeSiblingCarousel } from '../../components/views/TreeSiblingCarousel';
import type { GenealogyData, Individual } from '../../types/genealogy';

describe('Frères et sœurs à droite dans l\'Arbre (TreeSiblingCarousel & TreeView)', () => {
  const mockIndividuals: Record<string, Individual> = {
    '@I_FATHER@': {
      id: '@I_FATHER@',
      name: 'Henri Coste',
      sex: 'M',
      birth: { date: '16 NOV 1905' },
      death: { date: '19 OCT 1982' },
      familiesAsSpouse: ['@F1@'],
      familiesAsChild: [],
    },
    '@I_MOTHER@': {
      id: '@I_MOTHER@',
      name: 'Marie Palem',
      sex: 'F',
      birth: { date: '07 FEB 1907' },
      death: { date: '28 FEB 1998' },
      familiesAsSpouse: ['@F1@'],
      familiesAsChild: [],
    },
    // Sibling 1 (Elder sister, 1931)
    '@I_RAYMONDE@': {
      id: '@I_RAYMONDE@',
      name: 'Raymonde Coste',
      givenName: 'Raymonde',
      sex: 'F',
      birth: { date: '13 MAR 1931', parsedDate: { raw: '1931', year: 1931, month: 3, day: 13 } },
      familiesAsChild: ['@F1@'],
      familiesAsSpouse: [],
    },
    // Sibling 2 (Root person, Gabrielle, 1940)
    '@I_GABRIELLE@': {
      id: '@I_GABRIELLE@',
      name: 'Gabrielle Coste',
      givenName: 'Gabrielle',
      sex: 'F',
      birth: { date: '19 APR 1940', parsedDate: { raw: '1940', year: 1940, month: 4, day: 19 } },
      familiesAsChild: ['@F1@'],
      familiesAsSpouse: [],
      sosaNumber: 1,
    },
    // Sibling 3 (Younger sister, Jacqueline)
    '@I_JACQUELINE@': {
      id: '@I_JACQUELINE@',
      name: 'Jacqueline Coste',
      givenName: 'Jacqueline',
      sex: 'F',
      birth: { date: '1943', parsedDate: { raw: '1943', year: 1943 } },
      familiesAsChild: ['@F1@'],
      familiesAsSpouse: [],
    },
    // Sibling 4 (Younger brother, Michel)
    '@I_MICHEL@': {
      id: '@I_MICHEL@',
      name: 'Michel Coste',
      givenName: 'Michel',
      sex: 'M',
      birth: { date: '1947', parsedDate: { raw: '1947', year: 1947 } },
      familiesAsChild: ['@F1@'],
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
        childrenIds: ['@I_RAYMONDE@', '@I_GABRIELLE@', '@I_JACQUELINE@', '@I_MICHEL@'],
      },
    },
    sources: {},
  };

  const sosaMap: Record<string, number> = {
    '@I_GABRIELLE@': 1,
    '@I_FATHER@': 2,
    '@I_MOTHER@': 3,
  };

  it('affiche les frères et sœurs à droite dans TreeSiblingCarousel', () => {
    const currentPerson = mockIndividuals['@I_GABRIELLE@'];
    const siblings = [
      mockIndividuals['@I_RAYMONDE@'],
      mockIndividuals['@I_JACQUELINE@'],
      mockIndividuals['@I_MICHEL@'],
    ];

    const html = renderToString(
      <TreeSiblingCarousel
        currentPerson={currentPerson}
        siblings={siblings}
        sosaMap={sosaMap}
        onSelectPerson={() => {}}
        onViewProfile={() => {}}
      />
    );

    // Indicator of siblings to the right
    expect(html).toContain('3 frères &amp; sœurs à droite');
    expect(html).toContain('Glissez avec souris ou doigt');

    // Cards content
    expect(html).toContain('Raymonde Coste');
    expect(html).toContain('Jacqueline Coste');
    expect(html).toContain('Michel Coste');

    // Relative age
    expect(html).toContain('9 ans aînée');
    expect(html).toContain('3 ans cadette');

    // Action buttons
    expect(html).toContain('Racine arbre');
    expect(html).toContain('Fiche');
  });

  it('intègre la fratrie à droite dans la vue Arbre (TreeView mode ascendance)', () => {
    const html = renderToString(
      <TreeView
        data={mockData}
        selectedPersonId="@I_GABRIELLE@"
        onSelectPerson={() => {}}
        onViewProfile={() => {}}
      />
    );

    // Toolbar button for Fratrie
    expect(html).toContain('Fratrie (3)');

    // In the tree canvas, Gabrielle Coste is root
    expect(html).toContain('Gabrielle Coste');
    // Henri Coste & Marie Palem are parents below
    expect(html).toContain('Henri Coste');
    expect(html).toContain('Marie Palem');

    // Siblings are rendered to the right
    expect(html).toContain('Raymonde Coste');
    expect(html).toContain('Jacqueline Coste');
    expect(html).toContain('Michel Coste');
    expect(html).toContain('3 frères &amp; sœurs à droite');
  });

  it('gère l\'absence de fratrie sans régression pour un enfant unique', () => {
    const soloData: GenealogyData = {
      individuals: {
        '@I_SOLO@': {
          id: '@I_SOLO@',
          name: 'Unique Dupont',
          sex: 'M',
          familiesAsChild: ['@F_SOLO@'],
          familiesAsSpouse: [],
        },
      },
      families: {
        '@F_SOLO@': {
          id: '@F_SOLO@',
          childrenIds: ['@I_SOLO@'],
        },
      },
      sources: {},
    };

    const html = renderToString(
      <TreeView
        data={soloData}
        selectedPersonId="@I_SOLO@"
        onSelectPerson={() => {}}
        onViewProfile={() => {}}
      />
    );

    expect(html).toContain('Unique Dupont');
    expect(html).not.toContain('frères &amp; sœurs à droite');
  });
});
