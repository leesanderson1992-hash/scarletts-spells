export interface MeaningConnectionTarget {
  canonicalWordId: string;
  word: string;
  audioText?: string;
  definition: string;
  componentMeanings?: readonly string[];
  componentToWholeRelationship?: string;
}
