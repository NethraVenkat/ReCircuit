"use client";
import React, { useId, useState } from "react";
export interface RecordListState<T> { query: string; status: string; setQuery: (value: string) => void; setStatus: (value: string) => void; rows: T[]; total: number; matched: number; page: number; pageCount: number; previous: () => void; next: () => void }
export function useRecordList<T>(records: T[], search: (record: T) => string, statusOf: (record: T) => string, pageSize = 8): RecordListState<T> {
  const [query, changeQuery] = useState(""), [status, changeStatus] = useState("all"), [requestedPage, setPage] = useState(1);
  const matched = records.filter(record => (status === "all" || statusOf(record) === status) && search(record).toLowerCase().includes(query.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize)), page = Math.min(requestedPage, pageCount);
  return { query, status, setQuery: (value: string): void => { changeQuery(value); setPage(1); }, setStatus: (value: string): void => { changeStatus(value); setPage(1); }, rows: matched.slice((page - 1) * pageSize, page * pageSize), total: records.length, matched: matched.length, page, pageCount, previous: (): void => setPage(Math.max(1, page - 1)), next: (): void => setPage(Math.min(pageCount, page + 1)) };
}
type Controls = Pick<RecordListState<unknown>, "query" | "status" | "setQuery" | "setStatus" | "matched" | "total">;
export function RecordListControls({ list, statuses, searchLabel = "Search records" }: { list: Controls; statuses: Array<{ value: string; label: string }>; searchLabel?: string }): React.JSX.Element {
  const id = useId();
  return <div className="workspace-filters"><label htmlFor={id + "-search"}>{searchLabel}<input id={id + "-search"} type="search" value={list.query} onChange={e => list.setQuery(e.target.value)}/></label><div><label htmlFor={id + "-status"}>Status</label><select id={id + "-status"} value={list.status} onChange={e => list.setStatus(e.target.value)}><option value="all">All statuses</option>{statuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div><p role="status">{list.matched} of {list.total} records</p></div>;
}
export function RecordListPagination({ list }: { list: Pick<RecordListState<unknown>, "page" | "pageCount" | "previous" | "next"> }): React.JSX.Element {
  return <nav className="workspace-pagination" aria-label="Record pages"><button type="button" disabled={list.page === 1} onClick={list.previous}>Previous page</button><span>Page {list.page} of {list.pageCount}</span><button type="button" disabled={list.page === list.pageCount} onClick={list.next}>Next page</button></nav>;
}
