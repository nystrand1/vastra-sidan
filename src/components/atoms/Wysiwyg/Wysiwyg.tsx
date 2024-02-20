
import { type HTMLReactParserOptions } from 'html-react-parser';
import parse from "html-react-parser"
import Image from 'next/image';
interface WysiwygProps {
  content: string
}

// Utilize html-react-parser to parse the content and replace img tags with Next Image components.
const options: HTMLReactParserOptions = {
  replace: (domNode) => {
    const shouldReplace = process.env.VERCEL_ENV === 'production' || !process.env.VERCEL_URL
    // Look for an img tag and replace it with Image.
    if (shouldReplace && 'name' in domNode && 'attribs' in domNode && domNode.name === "img") {
      const { src, alt, width, height } = domNode.attribs
      return (
        <Image
          src={src || ''}
          width={Number(width) || 400}
          height={Number(height) || 400}
          alt={alt || ''}
          objectFit="cover"
        />
      )
    }
  },
}

export const Wysiwyg = ({ content } : WysiwygProps) => {

  return (
    <div className="[&_p]:mb-4 [&_h3]:mb-4 [&_div]:mb-4 [&_a]:underline">
      {parse(content, options)}
    </div>
  )
}