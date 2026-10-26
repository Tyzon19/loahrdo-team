import "./NotFound.css";

type NotFoundProps = {
  homePath?: string;
  homeLabel?: string;
  onRetry?: () => void;
  variant?: "not-found" | "error";
};

export default function NotFound({
  homePath = "/",
  homeLabel = "Go Back",
  onRetry,
  variant = "not-found",
}: NotFoundProps) {
  const isError = variant === "error";

  return (
    <main className="not-found">
      <section className="error-page" aria-labelledby="error-title">
        <svg
          className="error-page__waves"
          viewBox="0 0 1813.426 680.385"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M87.5 680.385C219.333 680.052 463.901 595.045 583.5 427.885C729.619 223.658 741 128.385 886 28.885C1070.805 -97.929 1168 227.885 1234.5 328.885C1301 429.885 1319.5 613.885 1657 562.385C1927 521.185 1787.167 318.218 1683.5 221.885C1626.167 304.218 1471.5 428.285 1311.5 265.885C1111.5 62.885 1002.5 137.83 939 196.885C865.994 282.798 792.029 430.139 720.5 482.885C579.222 587.062 438.5 584.885 381.5 584.885C27.872 557.995 48.5 116.218 0 148.885"
            stroke="#369065"
            strokeOpacity="0.6"
            strokeWidth="3"
          />
        </svg>

        <div className="error-page__content">
          <p className="error-page__eyebrow">{isError ? "Uh-oh..." : "Ooops..."}</p>

          <h1 id="error-title" className="error-page__title">
            {isError ? (
              "Unable to open this page"
            ) : (
              <>
                <span className="sr-only">404: </span>
                Page not found
              </>
            )}
          </h1>

          <p className="error-page__description">
            {isError
              ? "Something went wrong while opening this page. Please try again or return to a safe page."
              : "The page you are looking for doesn’t exist or another error occurred, go back to home page."}
          </p>

          <div className="error-page__actions">
            {isError && onRetry && (
              <button className="error-page__button" type="button" onClick={onRetry}>
                Try Again
              </button>
            )}
            <a
              className={
                isError ? "error-page__button error-page__button--secondary" : "error-page__button"
              }
              href={homePath}
            >
              {isError ? homeLabel : "Go Back"}
              <span className="sr-only"> to {isError ? homeLabel.toLowerCase() : "home page"}</span>
            </a>
          </div>
        </div>

        <div className="error-page__branding">
          <img
            className="error-page__logo"
            src="/loa-logo.png"
            alt="Lyceum of Alabang"
            width={500}
            height={500}
          />
        </div>

        <div className="error-page__digits" aria-hidden="true">
          <span>4</span>
          <span>0</span>
          <span>4</span>
        </div>
      </section>
    </main>
  );
}
