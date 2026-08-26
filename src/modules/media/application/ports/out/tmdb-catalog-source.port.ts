import type {
  TmdbChangePage,
  TmdbInventoryMovie,
} from "@media/application/models/tmdb-catalog-sync.js";

export interface TmdbCatalogSourcePort {
  streamMovieInventory(
    exportDate: string,
  ): AsyncIterable<TmdbInventoryMovie>;
  getChangedMovieIds(input: {
    startDate: string;
    endDate: string;
    page: number;
  }): Promise<TmdbChangePage>;
}
