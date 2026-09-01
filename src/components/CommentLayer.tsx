import React, { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '@/stores/canvas';
import { motion } from 'motion/react';
import { nanoid } from 'nanoid';
import { deleteAnnotation } from '@/lib/api';

interface CommentLayerProps {
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
}

export function CommentLayer({
  canvasWidth,
  canvasHeight,
  zoom,
}: CommentLayerProps) {
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [commentPos, setCommentPos] = useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { annotations, addAnnotation, removeAnnotation, activeTool, penColor } = useCanvasStore();

  const comments = annotations.filter((a) => a.type === 'comment');

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'comment') return;

    // A bubble's already open — this click is "away from it", so just
    // dismiss it rather than also opening a new one at the same time.
    if (isAddingComment) {
      handleCancelComment();
      return;
    }

    // currentTarget (this layer, sized to the full board) — not target,
    // which could be whatever nested element the click actually landed on.
    // No separate pan subtraction: this layer lives inside the pan/zoom-
    // transformed board container, so its rect already reflects the
    // current pan (see getCanvasCoordinates in lib/drawing.ts for the
    // same reasoning — subtracting it again broke comment placement as
    // soon as the board had actually been panned/scrolled).
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    setCommentPos({ x, y });
    setIsAddingComment(true);
  };

  const handleSubmitComment = () => {
    if (!commentPos || !commentText.trim()) return;

    addAnnotation({
      id: nanoid(),
      type: 'comment',
      text: commentText,
      x: commentPos.x,
      y: commentPos.y,
      color: penColor,
      timestamp: Date.now(),
    });

    setCommentText('');
    setCommentPos(null);
    setIsAddingComment(false);
  };

  const handleCancelComment = () => {
    setIsAddingComment(false);
    setCommentPos(null);
    setCommentText('');
  };

  // Escape cancels; Enter posts (Shift+Enter for a newline)
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelComment();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitComment();
    }
  };

  useEffect(() => {
    if (isAddingComment) textareaRef.current?.focus();
  }, [isAddingComment]);

  return (
    <div
      className={`absolute inset-0 ${activeTool === 'comment' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{
        zIndex: 100,
        cursor: activeTool === 'comment' ? "url('/cursors/comment.png') 5 30, crosshair" : undefined,
      }}
      onClick={handleCanvasClick}
    >
      {/* Existing Comments */}
      {comments.map((comment) => (
        <motion.div
          key={comment.id}
          className="absolute pointer-events-auto"
          style={{
            left: `${(comment.x / canvasWidth) * 100}%`,
            top: `${(comment.y / canvasHeight) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
        >
          <div className="bg-yellow-200 rounded-lg p-3 shadow-md max-w-xs border-2 border-yellow-300 group">
            <p className="text-sm text-gray-900 break-words">{comment.text}</p>
            <p className="text-xs text-gray-500 mt-1">
              {new Date(comment.timestamp).toLocaleTimeString()}
            </p>
            <button
              onClick={() => {
                removeAnnotation(comment.id);
                // removeAnnotation only touches the local store. Without this
                // the row survives in D1 and the next page load fetches the
                // comment straight back.
                deleteAnnotation(comment.id);
              }}
              className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 text-gray-500 hover:text-red-500 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        </motion.div>
      ))}

      {/* Comment Input — a small speech-bubble popover right at the click
          point, sticker-styled to match the cursor icons (white, rounded,
          soft shadow) instead of a full-screen modal takeover. */}
      {isAddingComment && commentPos && (
        <motion.div
          className="absolute pointer-events-auto"
          style={{
            left: `${(commentPos.x / canvasWidth) * 100}%`,
            top: `${(commentPos.y / canvasHeight) * 100}%`,
            transform: 'translate(-14px, calc(-100% - 14px))',
          }}
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.12 }}
        >
          <div className="relative bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.18)] p-2.5 w-60">
            <textarea
              ref={textareaRef}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Leave a comment..."
              className="w-full text-sm border-0 focus:outline-none resize-none placeholder:text-gray-400"
              rows={2}
            />
            <div className="flex justify-end mt-1">
              <button
                onClick={handleSubmitComment}
                disabled={!commentText.trim()}
                className="px-3 py-1 bg-blue-500 text-white text-xs font-medium rounded-full disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600"
              >
                Post
              </button>
            </div>

            {/* Speech-bubble tail, pointing down toward the click point */}
            <div className="absolute w-3.5 h-3.5 bg-white rotate-45 rounded-[2px]" style={{ bottom: '-5px', left: '16px' }} />
          </div>
        </motion.div>
      )}
    </div>
  );
}
