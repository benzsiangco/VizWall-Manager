import React from "react";
import { KanbanBoard } from "../components/KanbanBoard";

interface PipelineProps {
  searchQuery?: string;
}

export const Pipeline: React.FC<PipelineProps> = ({ searchQuery = "" }) => {
  return (
    <div className="flex-1 flex min-w-0 overflow-hidden">
      <KanbanBoard searchQuery={searchQuery} />
    </div>
  );
};
