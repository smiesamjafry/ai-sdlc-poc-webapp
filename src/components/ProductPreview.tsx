import { useEffect, useRef, useState } from "react";
import { formatPrice, type Product } from "../lib/catalog";
import { carouselImages, similarProducts, wrapIndex } from "../lib/preview";

export function ProductPreview({
  product,
  onAdd,
  onSelect,
  onClose,
}: {
  product: Product;
  onAdd: (productId: string) => void;
  onSelect: (productId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // Native modal dialog: traps focus and closes on Escape (which fires the close event).
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const similar = similarProducts(product);

  return (
    <dialog ref={ref} className="preview" aria-labelledby="preview-title" onClose={onClose}>
      <div className="preview-head">
        <h2 id="preview-title">{product.name}</h2>
        <button type="button" className="link" onClick={() => ref.current?.close()}>
          Close
        </button>
      </div>
      {/* Keyed by product so switching products resets the carousel to image 1. */}
      <Carousel key={product.id} product={product} />
      <p className="price">{formatPrice(product.priceCents)}</p>
      <p>{product.description}</p>
      <button type="button" onClick={() => onAdd(product.id)}>
        Add to cart
      </button>
      {similar.length > 0 && (
        <section className="similar">
          <h3>Similar products</h3>
          <ul>
            {similar.map((p) => (
              <li key={p.id}>
                <button type="button" className="similar-item" onClick={() => onSelect(p.id)}>
                  <span>{p.name}</span>
                  <span>{formatPrice(p.priceCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </dialog>
  );
}

function Carousel({ product }: { product: Product }) {
  const images = carouselImages(product);
  const [index, setIndex] = useState(0);
  const step = (delta: number) => setIndex((i) => wrapIndex(i + delta, images.length));

  return (
    <div className="carousel" role="group" aria-roledescription="carousel" aria-label={`${product.name} images`}>
      <img
        src={images[index]}
        alt={`${product.name} image ${index + 1}`}
        className="carousel-image"
        width={480}
        height={300}
      />
      <div className="carousel-controls">
        <button type="button" onClick={() => step(-1)} aria-label="Previous image">
          ‹
        </button>
        <span aria-live="polite">
          Image {index + 1} of {images.length}
        </span>
        <button type="button" onClick={() => step(1)} aria-label="Next image">
          ›
        </button>
      </div>
    </div>
  );
}
