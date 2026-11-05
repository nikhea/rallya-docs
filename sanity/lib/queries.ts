import { defineQuery } from "groq";

export const sectionsQuery = defineQuery(`*[_type == "docSection"] | order(order asc) {
  _id,
  title,
  icon,
  order
}`);

export const pagesQuery = defineQuery(`*[_type == "docPage"] | order(order asc) {
  _id,
  title,
  "slug": slug.current,
  description,
  icon,
  order,
  body,
  "section": section->{ _id, title, icon, order }
}`);
