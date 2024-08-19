export interface NewsPost {
  id: number;
  modified: string;
  slug: string;
  acf: {
    title: string;
    news_img: string;
    text: string;
    author: string;
  };
}

export interface MenuItem {
  ID: number;
  title: string;
  url: string;
  type: string;
  target: string;
}

export interface WPOptionsPage {
  acf: {
    bandy: {
      name: string;
    }[];
    bankNumber: string;
    buyLink: {
      title: string;
      url: string;
      target: string;
    };
    cardDelivery: string;
    currentMemberCount: string;
    football: {
      name: string;
    }[];
    lastYearMemberCount: string;
    memberBenefits: string;
    memberInfo: string;
    title: string;
    swishNumber: string;
    memberGoal: string;
    //wrongly typed in WP
    memberinfo: string;
    fotboll: {
      name: string;
    }[];
  };
}

export interface Bus {
  busName: string;
  occupiedSeats: string;
  maxSeats: string;
  requiredSeats: string;
}

export interface Media {
  ID: number;
  id: number;
  title: string;
  filename: string;
  url: string;
  alt: string;
  description: string;
  caption: string;
  name: string;
  date: string;
  modified: string;
}

export interface Image extends Media {
  sizes: {
    thumbnail: string;
    medium: string;
    medium_large: string;
    large: string;
  };
}

export interface Hero {
  title: string;
  media: Media;
  secondImage: Image;
  thirdImage: Image;
}

export interface StartPage {
  acf: {
    hero: Hero;
  };
}

export interface Membership {
  id: number;
  title: {
    rendered: string;
  };
  acf: {
    startDate: string;
    endDate: string;
    youthPrice: string;
    regularPrice: string;
    familyPrice: string;
    image: Image;
  };
}
