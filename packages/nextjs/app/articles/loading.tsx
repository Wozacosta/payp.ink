export default function ArticlesLoading() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl grow">
      <div className="h-8 w-32 skeleton mb-6"></div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card card-bordered bg-base-100 shadow-sm">
            <div className="card-body p-5">
              <div className="h-5 w-3/4 skeleton mb-2"></div>
              <div className="flex gap-3">
                <div className="h-4 w-28 skeleton"></div>
                <div className="h-4 w-20 skeleton"></div>
                <div className="h-4 w-24 skeleton"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
