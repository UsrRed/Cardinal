import { XMLParser } from 'fast-xml-parser';

export class XmlRejectedError extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,
  htmlEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

export function parseXmlSafe(xml: string): unknown {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new XmlRejectedError('xml_rejected');
  try {
    return parser.parse(xml);
  } catch {
    throw new XmlRejectedError('xml_invalid');
  }
}
