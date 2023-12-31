

const bandySortingTable = {
  'Elitserien': 1,
  'Allsvenskan': 2,
  'Division 1': 3,
  'Division 2': 4,
  'Division 3': 5,
  'Division 4': 6,
  'Division 5': 7,
  'Division 6': 8,
  'Division kk och övrigt': 9,
  'Gamla arenor': 10,  
}

export const bandyDivisions = Object.keys(bandySortingTable);
type BandyDivision = keyof typeof bandySortingTable;

export const bandySorter = (a: BandyDivision, b: BandyDivision) => {
  return bandySortingTable[a] - bandySortingTable[b];
};

const fotballSotringTable = {
  'Allsvenskan': 1,
  'Superettan': 2,
  'Division 1': 3,
  'Division 2': 4,
  'Division 3': 5,
  'Division 4': 6,
  'Division 5': 7,
  'Division 6': 8,
  'Allsvenskan damer': 9,
  'Elitettan': 10,
  'Division 1 damer': 11,
  'Division 2 damer': 12,
  'Division 3 damer': 13,
  'Division 4 damer': 14,
  'Division 5 damer': 15,
  'Division kk och övrigt': 16,
  'Gamla arenor': 17,
}

export const fotballDivisions = Object.keys(fotballSotringTable);

export const fotballSorter = (a: keyof typeof fotballSotringTable, b: keyof typeof fotballSotringTable) => {
  return fotballSotringTable[a] - fotballSotringTable[b];
}