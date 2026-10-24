interface TransportEvent {
  name: string;
  description: string;
}

// A word starting with "tåg" (tåg, tåget, tågresa...), but not e.g. "avtåg"
const TRAIN_KEYWORD = /(^|[^\p{L}])tåg/iu;

/** Away games are by bus unless the name or description mentions "tåg". */
export const isTrainEvent = ({ name, description }: TransportEvent) =>
  TRAIN_KEYWORD.test(name) || TRAIN_KEYWORD.test(description);

const busLabels = {
  label: "Buss",
  selectPlaceholder: "Välj buss...",
  departs: "Bussen avgår",
  departed: "Bussen har avgått",
  info: "Bussinfo",
  chooseAnother: "vänligen välj en annan buss",
  someFull: "Någon buss är fullbokad",
  change: "Byt buss",
  changing: "Byter buss...",
  changed: "Bussbyte slutfört"
};

export type TransportLabels = typeof busLabels;

const trainLabels: TransportLabels = {
  label: "Tåg",
  selectPlaceholder: "Välj tåg...",
  departs: "Tåget avgår",
  departed: "Tåget har avgått",
  info: "Tåginfo",
  chooseAnother: "vänligen välj ett annat tåg",
  someFull: "Något tåg är fullbokat",
  change: "Byt tåg",
  changing: "Byter tåg...",
  changed: "Tågbyte slutfört"
};

export const getTransportLabels = (isTrain: boolean) => (isTrain ? trainLabels : busLabels);
