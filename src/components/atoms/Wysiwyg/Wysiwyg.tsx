
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
      const isMap = src?.includes('hitta.gif')
      const mapClassName = isMap ? 'w-[100px] py-2' : ''
      return (
        <Image
          src={src || ''}
          width={Number(width) || 1600}
          height={Number(height) || 900}
          alt={alt || ''}
          style={{ objectFit: 'contain' }}
          className={`m-auto rounded-md ${mapClassName}`}
        />
      )
    }
  },
}

export const Wysiwyg = ({ content } : WysiwygProps) => {

  return (
    <div className="[&_p]:mb-4 [&_h3]:mb-4 [&_div]:mb-4 [&_a]:underline [&_iframe]:w-full [&_iframe]:rounded-md">
      {parse(content, options)}
    </div>
  )
}