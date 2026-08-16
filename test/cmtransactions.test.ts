import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ session: { fromPartition: () => ({}) } }))

import {
  Anomalie,
  DEFAULT_CMTX_CONFIG,
  bornesDuMois,
  controlePeriode,
  enDate,
  enNombre,
  finDeMois,
  lignesTelechargements,
  lireExport,
  parseCsv,
  preparer,
  trouverExport
} from '../src/main/cmtransactions'

const H =
  'Date;Transaction;Category;Type;Counterpart;Reference;Amount;Starting balance (EUR);Closing balance (EUR)'

function csv(rows: string[]): string {
  return [H, ...rows].join('\n')
}

describe('conversions (spec compta)', () => {
  it('montants : formats FR/EN, symboles, négatifs', () => {
    expect(enNombre('97,52 €')).toBe(97.52)
    expect(enNombre('-1.234,56')).toBe(-1234.56)
    expect(enNombre('-1234.56')).toBe(-1234.56)
    expect(enNombre('1,234.56')).toBe(1234.56)
    expect(enNombre('abc')).toBe(0) // comme la version Python : texte sans chiffre = 0
    expect(() => enNombre('12-34')).toThrow(Anomalie)
  })

  it('dates : les formats Cardmarket → ISO', () => {
    expect(enDate('30.06.2026 16:13:47')).toBe('2026-06-30')
    expect(enDate('01/07/2026 08:00:00')).toBe('2026-07-01')
    expect(enDate('2026-06-30')).toBe('2026-06-30')
    expect(() => enDate('hier')).toThrow(Anomalie)
  })

  it('fin de mois (année bissextile comprise)', () => {
    expect(finDeMois('2026-06')).toBe('2026-06-30')
    expect(finDeMois('2026-07')).toBe('2026-07-31')
    expect(finDeMois('2028-02')).toBe('2028-02-29')
    expect(bornesDuMois('2026-07')).toEqual(['2026-07-01', '2026-07-31'])
  })
})

describe('lecture du fichier', () => {
  it('chaîne des soldes vérifiée : une rupture arrête tout', () => {
    const bad = csv([
      '01.06.2026 10:00:00;111;Sales;Sales;Acheteur1;V1;10,00;100,00;110,00',
      '02.06.2026 10:00:00;112;Sales;Sales;Acheteur2;V2;5,00;115,00;120,00'
    ])
    expect(() => lireExport(bad)).toThrow(/rupture dans la chaîne des soldes/)
  })

  it('solde incohérent sur une ligne = arrêt', () => {
    const bad = csv(['01.06.2026 10:00:00;111;Sales;Sales;A;V1;10,00;100,00;115,00'])
    expect(() => lireExport(bad)).toThrow(/solde incohérent/)
  })

  it('type inconnu = arrêt avec le nom exact', () => {
    const bad = csv(['01.06.2026 10:00:00;111;Sales;Bonus mystère;A;V1;10,00;100,00;110,00'])
    expect(() => lireExport(bad)).toThrow(/Bonus mystère/)
  })

  it('mauvais fichier (bilan par catégorie) = message explicite', () => {
    expect(() => lireExport('Category;Total\nSales;100')).toThrow(/Montrer toutes les transactions/)
  })

  it('classement sur Type, jamais Category (Trustee porte Category=Purchases)', () => {
    const ok = csv([
      '01.06.2026 10:00:00;111;Purchases;Trustee service fees;Cardmarket;T1;-0,50;100,00;99,50'
    ])
    const { mvts } = lireExport(ok)
    expect(mvts[0].type).toBe('Trustee service fees')
    expect(mvts[0].individuel).toBe(false)
  })

  it('CSV avec guillemets et BOM', () => {
    const rows = parseCsv('﻿a;"x;y";c\n1;2;3')
    expect(rows[0]).toEqual(['a', 'x;y', 'c'])
  })
})

describe('préparation des lignes', () => {
  const fichier = csv([
    '01.06.2026 10:00:00;111;Sales;Sales;Acheteur1;V100;10,00;100,00;110,00',
    '02.06.2026 10:00:00;112;Sales;Commissions;Cardmarket;V100;-0,50;110,00;109,50',
    '03.06.2026 10:00:00;113;Sales;Commission Refunds;Cardmarket;V101;0,10;109,50;109,60',
    '04.06.2026 10:00:00;114;Purchases;Trustee service fees;Cardmarket;V102;-0,30;109,60;109,30',
    '05.06.2026 10:00:00;115;Purchases;Withdrawals;-;W1;-50,00;109,30;59,30',
    '01.07.2026 08:00:00;116;Sales;Sales;Acheteur2;V103;7,00;59,30;66,30'
  ])

  it('individuelles + UNE ligne de frais datée fin de mois', () => {
    const { mvts } = lireExport(fichier)
    const lignes = preparer(mvts, '2026-06')
    const frais = lignes.find((l) => l.type === 'Frais (agrégé)')
    expect(frais).toBeDefined()
    expect(frais!.date).toBe('2026-06-30')
    expect(frais!.montant).toBe(-0.7)
    expect(frais!.cle).toBe('cardmarket:frais:2026-06')
    expect(frais!.detail).toEqual({
      'Commission Refunds': 0.1,
      Commissions: -0.5,
      'Trustee service fees': -0.3
    })
    // 2 individuelles de juin (Sales + Withdrawals) + 1 frais ; juillet exclu
    expect(lignes).toHaveLength(3)
    expect(lignes.every((l) => l.date.startsWith('2026-06'))).toBe(true)
  })

  it('libellé sans tiers quand Counterpart vaut Cardmarket ou -', () => {
    const { mvts } = lireExport(fichier)
    const lignes = preparer(mvts, '2026-06')
    const w = lignes.find((l) => l.type === 'Withdrawals')!
    expect(w.libelle).toBe('Withdrawals - W1')
    const s = lignes.find((l) => l.type === 'Sales')!
    expect(s.libelle).toBe('Sales - Acheteur1 - V100')
  })

  it('clé anti-doublon par transaction', () => {
    const { mvts } = lireExport(fichier)
    const s = preparer(mvts, '2026-06').find((l) => l.type === 'Sales')!
    expect(s.cle).toBe('cardmarket:111')
  })

  it('période absente = arrêt avec les périodes disponibles', () => {
    const { mvts } = lireExport(fichier)
    expect(() => preparer(mvts, '2026-01')).toThrow(/2026-06 \(5 mouvements\)/)
  })

  it('débordement de fin de mois : alerte si la période est minoritaire', () => {
    const { mvts } = lireExport(fichier)
    expect(controlePeriode(mvts, '2026-07')).toHaveLength(1)
    expect(controlePeriode(mvts, '2026-06')).toHaveLength(0)
  })
})

describe('page Téléchargements', () => {
  const HTML = `
    <tr><td class="a"><span>Transactions</span></td>
    <td class="b">2026-08-16 10:00</td>
    <td class="c"><span>2026-08-16 10:01</span></td>
    <td><form><input name="idRequest" value="4212"><button><span class="i"></span>Transaction Summary-2026-06-01_2026-07-01.csv</button></form></td></tr>
    <tr><td class="a"><span>Transactions</span></td>
    <td class="b">2026-08-16 10:05</td>
    <td class="c"><span></span></td>
    <td><form><input name="idRequest" value="4213"><button><span class="i"></span>Transaction Summary-2026-07-01_2026-07-31.csv</button></form></td></tr>
  `

  it('extrait les lignes, triées par id décroissant', () => {
    const rows = lignesTelechargements(HTML)
    expect(rows).toHaveLength(2)
    expect(rows[0].id).toBe(4213)
    expect(rows[1].nom).toBe('Transaction Summary-2026-06-01_2026-07-01.csv')
  })

  it('trouve par couple de dates soumis, pas par nom calculé', () => {
    const rows = lignesTelechargements(HTML)
    const hit = trouverExport(rows, '2026-06-01', '2026-07-01', 'csv', 0)
    expect(hit?.id).toBe(4212)
  })

  it('colonne Fin vide = pas encore prêt', () => {
    const rows = lignesTelechargements(HTML)
    expect(trouverExport(rows, '2026-07-01', '2026-07-31', 'csv', 0)).toBeNull()
  })

  it('idMin écarte les fichiers antérieurs à notre demande', () => {
    const rows = lignesTelechargements(HTML)
    expect(trouverExport(rows, '2026-06-01', '2026-07-01', 'csv', 4212)).toBeNull()
  })
})
